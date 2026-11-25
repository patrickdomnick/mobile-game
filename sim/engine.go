package sim

import "math"

const (
	MaxHoopPearls = 49
	MaxFlying     = 12
	MaxLayers     = 3

	// Scene buffer layout (all vec4<f32> aligned for WebGPU storage buffer)
	// Header:       16 * 4 = 64 floats
	// Palette:       6 * 4 = 24 floats
	// Tiles:        49 * 8 = 392 floats
	// HoopPearls:   49 * 8 = 392 floats
	// TrayPearls:    5 * 8 = 40 floats
	// FlyingPearls: 12 * 8 = 96 floats
	// Total = 1008 floats (4,032 bytes)
	SceneHeaderFloats  = 64
	ScenePaletteFloats = NumColors * 4
	SceneTileOffset    = SceneHeaderFloats + ScenePaletteFloats
	SceneHoopOffset    = SceneTileOffset + MaxGridTiles*8
	SceneTrayOffset    = SceneHoopOffset + MaxHoopPearls*8
	SceneFlyingOffset  = SceneTrayOffset + TrayCapacity*8
	SceneFloats        = SceneFlyingOffset + MaxFlying*8

	// Telemetry / state buffer layout for JS & E2E bridge
	StateFloats = 52

	// Per-tile telemetry layout (49 * 8 = 392 floats):
	// [col, row, color, dir, alive, unblocked, worldX, worldZ]
	TileTelemetryStride = 8
	TileTelemetryFloats = MaxGridTiles * TileTelemetryStride

	PhasePlaying  = 0
	PhaseTrayFull = 1
	PhaseComplete = 2

	HintScorePenalty = uint32(250)
	UndoScorePenalty = uint32(150)
	HintNeedsUndo    = -2

	// World-space atelier geometry (portrait iPhone 16 layout on y=0 desk)
	CamPosX    = float32(0.0)
	CamPosY    = float32(12.6)
	CamPosZ    = float32(2.35)
	CamTargetX = float32(0.0)
	CamTargetY = float32(0.0)
	CamTargetZ = float32(0.25)
	CamFovY    = float32(0.72)

	HoopCenterX = float32(0.0)
	HoopCenterZ = float32(-1.84)
	HoopRadius  = float32(1.38)

	TrayCenterZ = float32(0.18)
	TraySpacing = float32(0.62)

	BoardCenterX = float32(0.0)
	BoardCenterZ = float32(2.28)
	BoardMaxSpan = float32(3.16)

	FixedDT = float32(1.0 / 60.0)
)

// HoopPearl tracks one embroidery stitch slot on the top hoop.
type HoopPearl struct {
	WorldX       float32
	WorldZ       float32
	Color        uint8
	Layer        uint8
	Claimed      bool
	Stitched     bool
	BloomT       float32
	ShimmerPulse float32
}

// FlyingPearl animates a freed pearl gliding from board/tray to hoop/tray.
type FlyingPearl struct {
	Active      bool
	Color       uint8
	StartX      float32
	StartY      float32
	StartZ      float32
	CtrlX       float32
	CtrlY       float32
	CtrlZ       float32
	EndX        float32
	EndY        float32
	EndZ        float32
	Progress    float32
	Delay       float32
	Duration    float32
	ToHoop      bool
	TargetIndex int
}

type undoSnapshot struct {
	aliveMask   uint64
	claimedMask uint64
	tray        [TrayCapacity]uint8
	trayLen     int
	remain      [NumColors]int
	active      [ActiveSlots]int
	queuePos    int
	score       uint32
	streak      uint32
	directCount int
	trayUses    int
	layerDone   [MaxLayers]bool
	phase       int
}

// Engine holds all deterministic Pearl Loom v2.0 state, Balatro/VS scoring, layers,
// 5 visual themes, 24h solar clock, blocker causal feedback, and flat GPU buffers.
type Engine struct {
	FrameCount     uint32
	ElapsedSec     float32
	TimeOfDayHours float32
	ThemeIndex     int

	LevelIndex   int
	ChapterIndex int
	Mode         int // 0=curated, 1=mandala, 2=daily
	Phase        int
	LastSeed     uint32

	// Meaningful Balatro-style mastery & scoring state
	Score            uint32
	Streak           uint32
	MaxStreak        uint32
	DirectCount      int
	TrayUses         int
	UndoUsed         int
	HintsUsed        int
	Stars            int
	LastPenaltyDelta uint32

	// Last scoring callout payload for JS floating popups
	LastScoreDelta  uint32
	LastEventWorldX float32
	LastEventWorldZ float32

	// Layer / Ring progression
	LayerTotal     [MaxLayers]int
	LayerDone      [MaxLayers]bool
	TotalLayers    int
	LayersComplete int

	// Juice FX state
	ShakeAmt             float32
	ColorBurstPulse      float32
	ColorBurstColor      int
	LayerBurstPulse      float32
	CelebrateT           float32
	LastTappedBlockedIdx int
	LastBlockerIdx       int
	BlockerFlashT        float32

	GridCols  int
	GridRows  int
	CellPitch float32

	Tiles      [MaxGridTiles]Tile
	TileCount  int
	HoopPearls [MaxHoopPearls]HoopPearl
	HoopCount  int
	Tray       [TrayCapacity]uint8
	TrayLen    int
	TrayPulse  [TrayCapacity]float32
	Flying     [MaxFlying]FlyingPearl

	ColorQueue [NumColors]uint8
	QueueLen   int
	QueuePos   int
	Remain     [NumColors]int
	Active     [ActiveSlots]int
	ColorGlowT [NumColors]float32

	HintTileIdx int
	HintPulse   float32

	// Event counters consumed by procedural Web Audio + floating score popups + haptics
	StitchEvents     uint32
	LastStitchCol    uint32
	CascadeEvents    uint32
	TrayEvents       uint32
	BlockedEvents    uint32
	UndoEvents       uint32
	HintEvents       uint32
	ColorClearEvents uint32
	LastColorCleared uint32
	LayerClearEvents uint32
	CompleteEvents   uint32

	undoStack []undoSnapshot

	Scene         [SceneFloats]float32
	State         [StateFloats]float32
	TileTelemetry [TileTelemetryFloats]float32
}

// Reset reloads the current level/mode cleanly (replaying the same Daily/Mandala seed if active).
func (e *Engine) Reset() {
	if e.TimeOfDayHours <= 0 {
		e.TimeOfDayHours = 12.5
	}
	if e.Mode == 1 && e.LastSeed > 0 {
		e.LoadMandala(e.LastSeed)
		return
	}
	if e.Mode == 2 && e.LastSeed > 0 {
		e.LoadDaily(e.LastSeed)
		return
	}
	if e.LevelIndex < 0 || e.LevelIndex >= len(CuratedArtworks) {
		e.LevelIndex = 0
	}
	e.LoadCuratedLevel(e.LevelIndex)
}

// SetTheme switches the active visual theme (0..4) immediately (retained for diagnostics/tests).
func (e *Engine) SetTheme(idx int) {
	if idx < 0 {
		idx = 0
	}
	e.ThemeIndex = idx % NumThemes
	e.syncBuffers()
}

// LoadCuratedLevel initializes one of the 40 handcrafted theme-matched patterns across 5 Chapters.
func (e *Engine) LoadCuratedLevel(idx int) {
	if len(CuratedArtworks) == 0 {
		return
	}
	if idx < 0 {
		idx = 0
	}
	idx = idx % len(CuratedArtworks)
	e.LevelIndex = idx
	e.Mode = 0
	e.LastSeed = 0
	e.loadArtwork(CuratedArtworks[idx])
}

// LoadMandala generates and loads an endless procedural 3-layer mandala with a native rotated theme.
func (e *Engine) LoadMandala(seed uint32) {
	if seed == 0 {
		seed = 1
	}
	e.LevelIndex = int(seed & 0x7FFF)
	e.Mode = 1
	e.LastSeed = seed
	theme := ThemeForMandala(seed)
	e.loadArtwork(GenerateMandalaArtwork(seed, theme))
}

// LoadDaily loads the deterministic calendar-seeded Daily Stitch mandala with a rotating daily theme.
func (e *Engine) LoadDaily(dateKey uint32) {
	if dateKey == 0 {
		dateKey = 20261124
	}
	e.LevelIndex = int(dateKey % 100000)
	e.Mode = 2
	e.LastSeed = dateKey
	theme := ThemeForDaily(dateKey)
	e.loadArtwork(GenerateMandalaArtwork(dateKey^0x517CC1B7, theme))
}

func (e *Engine) loadArtwork(art ArtworkDef) {
	e.Phase = PhasePlaying
	e.ThemeIndex = art.Theme % NumThemes
	e.ChapterIndex = art.Chapter
	e.Score = 0
	e.Streak = 0
	e.MaxStreak = 0
	e.DirectCount = 0
	e.TrayUses = 0
	e.UndoUsed = 0
	e.HintsUsed = 0
	e.Stars = 0
	e.LastScoreDelta = 0
	e.LastPenaltyDelta = 0
	e.ShakeAmt = 0
	e.ColorBurstPulse = 0
	e.ColorBurstColor = 0
	e.LayerBurstPulse = 0
	e.CelebrateT = 0
	e.LastTappedBlockedIdx = -1
	e.LastBlockerIdx = -1
	e.BlockerFlashT = 0

	e.GridCols = art.Cols
	e.GridRows = art.Rows
	e.TrayLen = 0
	e.HintTileIdx = -1
	e.HintPulse = 0
	e.undoStack = e.undoStack[:0]

	for i := range e.Flying {
		e.Flying[i].Active = false
	}
	for i := range e.TrayPulse {
		e.TrayPulse[i] = 0
	}

	maxDim := art.Cols
	if art.Rows > maxDim {
		maxDim = art.Rows
	}
	if maxDim < 1 {
		maxDim = 1
	}
	e.CellPitch = BoardMaxSpan / float32(maxDim)
	if e.CellPitch > 0.72 {
		e.CellPitch = 0.72
	}

	tiles, colorOrder, colorCount := generateSolvableBoard(art)
	e.TileCount = len(tiles)
	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i] = tiles[i]
	}

	e.HoopCount = len(art.Stitches)
	if e.HoopCount > MaxHoopPearls {
		e.HoopCount = MaxHoopPearls
	}
	for c := 0; c < NumColors; c++ {
		e.Remain[c] = 0
	}
	for l := 0; l < MaxLayers; l++ {
		e.LayerTotal[l] = 0
		e.LayerDone[l] = false
	}
	for i := 0; i < e.HoopCount; i++ {
		sp := art.Stitches[i]
		layer := sp.Layer
		if int(layer) >= MaxLayers {
			layer = MaxLayers - 1
		}
		e.HoopPearls[i] = HoopPearl{
			WorldX: HoopCenterX + sp.X*(HoopRadius*0.86),
			WorldZ: HoopCenterZ + sp.Z*(HoopRadius*0.86),
			Color:  sp.Color,
			Layer:  layer,
		}
		e.Remain[sp.Color]++
		e.LayerTotal[layer]++
	}

	e.TotalLayers = 0
	for l := 0; l < MaxLayers; l++ {
		if e.LayerTotal[l] > 0 {
			e.TotalLayers++
		}
	}
	e.LayersComplete = 0

	e.ColorQueue = colorOrder
	e.QueueLen = colorCount
	e.QueuePos = 0
	for i := 0; i < NumColors; i++ {
		e.ColorGlowT[i] = 0
	}
	for i := 0; i < ActiveSlots; i++ {
		e.Active[i] = -1
	}
	e.refillActiveColors()
	e.syncBuffers()
}

// SetTimeOfDayHours updates the continuous 24-hour real-world solar clock [0, 24).
func (e *Engine) SetTimeOfDayHours(hours float32) {
	h := float32(math.Mod(float64(hours), 24.0))
	if h < 0 {
		h += 24.0
	}
	e.TimeOfDayHours = h
	e.syncBuffers()
}

func (e *Engine) currentMultiplier() uint32 {
	m := uint32(1) + e.Streak
	if m > 12 {
		m = 12
	}
	return m
}

func (e *Engine) addShake(amount float32) {
	if amount > e.ShakeAmt {
		e.ShakeAmt = amount
	}
	if e.ShakeAmt > 1.0 {
		e.ShakeAmt = 1.0
	}
}

func (e *Engine) tileWorldPos(col, row int) (float32, float32) {
	halfC := float32(e.GridCols-1) * 0.5
	halfR := float32(e.GridRows-1) * 0.5
	wx := BoardCenterX + (float32(col)-halfC)*e.CellPitch
	wz := BoardCenterZ + (float32(row)-halfR)*e.CellPitch
	return wx, wz
}

func (e *Engine) traySlotWorldPos(slot int) (float32, float32) {
	half := float32(TrayCapacity-1) * 0.5
	wx := (float32(slot) - half) * TraySpacing
	return wx, TrayCenterZ
}

func (e *Engine) nextQueuedColor() int {
	for pos := e.QueuePos; pos < e.QueueLen; pos++ {
		c := int(e.ColorQueue[pos])
		if e.Remain[c] > 0 {
			return c
		}
	}
	return -1
}

// refillActiveColors fills up to 2 active stitch slots, EXCEPT the very last color in the queue
// is held back until the penultimate color is 100% completed (so the final two colors unlock separately!).
// Newly unlocked colors receive a gentle temporary 2.2s interior pearl glow (ColorGlowT = 1.0).
func (e *Engine) refillActiveColors() {
	activeAlive := 0
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] >= 0 && e.Remain[e.Active[i]] > 0 {
			activeAlive++
		} else {
			e.Active[i] = -1
		}
	}

	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] >= 0 {
			continue
		}
		for e.QueuePos < e.QueueLen {
			c := int(e.ColorQueue[e.QueuePos])
			if e.Remain[c] <= 0 {
				e.QueuePos++
				continue
			}
			isFinalColor := e.QueueLen >= 3 && e.QueuePos == e.QueueLen-1
			if isFinalColor && activeAlive > 0 {
				return
			}
			e.QueuePos++
			e.Active[i] = c
			e.ColorGlowT[c] = 1.0
			activeAlive++
			break
		}
	}
}

func (e *Engine) isActiveColor(c uint8) bool {
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] == int(c) && e.Remain[c] > 0 {
			return true
		}
	}
	return false
}

func (e *Engine) claimHoopSlot(color uint8) int {
	// Prefer earliest incomplete layer so embroidery visually builds inside-out layer by layer!
	for targetLayer := uint8(0); targetLayer < MaxLayers; targetLayer++ {
		for i := 0; i < e.HoopCount; i++ {
			if !e.HoopPearls[i].Claimed && e.HoopPearls[i].Color == color && e.HoopPearls[i].Layer == targetLayer {
				e.HoopPearls[i].Claimed = true
				return i
			}
		}
	}
	for i := 0; i < e.HoopCount; i++ {
		if !e.HoopPearls[i].Claimed && e.HoopPearls[i].Color == color {
			e.HoopPearls[i].Claimed = true
			return i
		}
	}
	return -1
}

func (e *Engine) checkLayerMilestones() {
	doneCount := 0
	for l := 0; l < MaxLayers; l++ {
		if e.LayerTotal[l] == 0 {
			continue
		}
		allClaimed := true
		for i := 0; i < e.HoopCount; i++ {
			if int(e.HoopPearls[i].Layer) == l && !e.HoopPearls[i].Claimed {
				allClaimed = false
				break
			}
		}
		if allClaimed {
			doneCount++
			if !e.LayerDone[l] {
				e.LayerDone[l] = true
				e.Score += 750
				e.LastScoreDelta += 750
				e.LayerBurstPulse = 1.0
				e.LayerClearEvents++
				e.addShake(0.82)
				// Shimmer every pearl in the newly completed layer!
				for i := 0; i < e.HoopCount; i++ {
					if int(e.HoopPearls[i].Layer) == l {
						e.HoopPearls[i].ShimmerPulse = 1.0
					}
				}
			}
		}
	}
	e.LayersComplete = doneCount
}

func (e *Engine) triggerColorCleared(color uint8) {
	e.Score += 500
	e.LastScoreDelta += 500
	e.ColorBurstPulse = 1.0
	e.ColorBurstColor = int(color)
	e.ColorClearEvents++
	e.LastColorCleared = uint32(color)
	e.addShake(0.58)
	// Ripple shimmer across all hoop pearls of this completed color
	for i := 0; i < e.HoopCount; i++ {
		if e.HoopPearls[i].Color == color {
			e.HoopPearls[i].ShimmerPulse = 1.0
		}
	}
}

func (e *Engine) spawnFlight(color uint8, sx, sy, sz, ex, ey, ez float32, delay float32, toHoop bool, targetIdx int) {
	slot := -1
	for i := range e.Flying {
		if !e.Flying[i].Active {
			slot = i
			break
		}
	}
	if slot < 0 {
		if toHoop && targetIdx >= 0 && targetIdx < e.HoopCount {
			e.HoopPearls[targetIdx].Stitched = true
			e.HoopPearls[targetIdx].BloomT = 1.0
			e.HoopPearls[targetIdx].ShimmerPulse = 1.0
		}
		return
	}

	ctrlX := (sx+ex)*0.5 + (ex-sx)*0.14
	ctrlZ := (sz + ez) * 0.5
	ctrlY := float32(1.55)
	if !toHoop {
		ctrlY = 0.85
	}

	e.Flying[slot] = FlyingPearl{
		Active:      true,
		Color:       color,
		StartX:      sx,
		StartY:      sy,
		StartZ:      sz,
		CtrlX:       ctrlX,
		CtrlY:       ctrlY,
		CtrlZ:       ctrlZ,
		EndX:        ex,
		EndY:        ey,
		EndZ:        ez,
		Progress:    0,
		Delay:       delay,
		Duration:    0.30,
		ToHoop:      toHoop,
		TargetIndex: targetIdx,
	}
}

func (e *Engine) captureUndoSnapshot() undoSnapshot {
	var aliveMask uint64
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive {
			aliveMask |= (uint64(1) << uint(i))
		}
	}
	var claimedMask uint64
	for i := 0; i < e.HoopCount; i++ {
		if e.HoopPearls[i].Claimed {
			claimedMask |= (uint64(1) << uint(i))
		}
	}
	return undoSnapshot{
		aliveMask:   aliveMask,
		claimedMask: claimedMask,
		tray:        e.Tray,
		trayLen:     e.TrayLen,
		remain:      e.Remain,
		active:      e.Active,
		queuePos:    e.QueuePos,
		score:       e.Score,
		streak:      e.Streak,
		directCount: e.DirectCount,
		trayUses:    e.TrayUses,
		layerDone:   e.LayerDone,
		phase:       e.Phase,
	}
}

func (e *Engine) drainTrayToHoop() {
	stagger := float32(0.07)
	for {
		progressed := false
		writeIdx := 0
		for i := 0; i < e.TrayLen; i++ {
			c := e.Tray[i]
			if e.isActiveColor(c) {
				hoopIdx := e.claimHoopSlot(c)
				if hoopIdx >= 0 {
					sx, sz := e.traySlotWorldPos(i)
					hp := &e.HoopPearls[hoopIdx]
					e.spawnFlight(c, sx, 0.22, sz, hp.WorldX, 0.14, hp.WorldZ, stagger, true, hoopIdx)
					stagger += 0.08
					e.Remain[c]--
					// Balatro-style escalating cascade bonus!
					e.Streak++
					if e.Streak > e.MaxStreak {
						e.MaxStreak = e.Streak
					}
					pts := uint32(125) * e.currentMultiplier()
					e.Score += pts
					e.LastScoreDelta += pts
					e.LastEventWorldX = hp.WorldX
					e.LastEventWorldZ = hp.WorldZ
					e.StitchEvents++
					e.CascadeEvents++
					e.LastStitchCol = uint32(c)
					e.addShake(0.28 + float32(e.currentMultiplier())*0.03)
					if e.Remain[c] == 0 {
						e.triggerColorCleared(c)
					}
					e.checkLayerMilestones()
					progressed = true
					continue
				}
			}
			e.Tray[writeIdx] = c
			writeIdx++
		}
		e.TrayLen = writeIdx
		if progressed {
			e.refillActiveColors()
		} else {
			break
		}
	}
}

func (e *Engine) updatePhase() {
	allClaimed := true
	for i := 0; i < e.HoopCount; i++ {
		if !e.HoopPearls[i].Claimed {
			allClaimed = false
			break
		}
	}
	if allClaimed && e.HoopCount > 0 {
		if e.Phase != PhaseComplete {
			e.Phase = PhaseComplete
			e.CelebrateT = 1.0
			e.addShake(0.92)
			// Pure Craft end-of-pattern bonuses!
			if e.TrayUses == 0 {
				e.Score += 1500
				e.LastScoreDelta += 1500
			}
			if e.UndoUsed == 0 && e.HintsUsed == 0 {
				e.Score += 750
				e.LastScoreDelta += 750
			}
			// Meaningful 1-3 Star mastery rating
			if e.UndoUsed == 0 && e.HintsUsed == 0 && e.TrayUses <= e.HoopCount/6 {
				e.Stars = 3
			} else if e.TrayUses <= e.HoopCount/3 {
				e.Stars = 2
			} else {
				e.Stars = 1
			}
			e.CompleteEvents++
		}
		return
	}

	if e.TrayLen >= TrayCapacity {
		hasDirect := false
		for i := 0; i < e.TileCount; i++ {
			if e.Tiles[i].Alive && e.isActiveColor(e.Tiles[i].Color) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
				hasDirect = true
				break
			}
		}
		if !hasDirect {
			e.Phase = PhaseTrayFull
			return
		}
	}
	e.Phase = PhasePlaying
}

func (e *Engine) computeTrayTension() float32 {
	switch e.TrayLen {
	case 0, 1, 2:
		return 0.0
	case 3:
		return 0.35
	case 4:
		return 0.72
	default:
		return 1.0
	}
}

// TapWorld maps a world-space XZ tap on the board plane to the nearest alive tile.
func (e *Engine) TapWorld(wx, wz float32) bool {
	bestIdx := -1
	bestDistSq := (e.CellPitch * 0.56) * (e.CellPitch * 0.56)
	for i := 0; i < e.TileCount; i++ {
		if !e.Tiles[i].Alive {
			continue
		}
		tx, tz := e.tileWorldPos(e.Tiles[i].Col, e.Tiles[i].Row)
		dx := wx - tx
		dz := wz - tz
		d2 := dx*dx + dz*dz
		if d2 < bestDistSq {
			bestDistSq = d2
			bestIdx = i
		}
	}
	if bestIdx < 0 {
		return false
	}
	return e.TapTile(bestIdx)
}

// TapTile attempts to untangle tile idx. Returns true if the tile was freed.
func (e *Engine) TapTile(idx int) bool {
	if e.Phase == PhaseComplete || idx < 0 || idx >= e.TileCount || !e.Tiles[idx].Alive {
		return false
	}

	blocker := findFirstBlocker(e.Tiles[:e.TileCount], idx, e.GridCols, e.GridRows)
	if blocker >= 0 {
		// Crystal-clear causal feedback: recoil wobble + highlight the EXACT blocking tile!
		e.Tiles[idx].WobbleT = 1.0
		e.Tiles[blocker].WobbleT = 0.65
		e.LastTappedBlockedIdx = idx
		e.LastBlockerIdx = blocker
		e.BlockerFlashT = 1.0
		e.addShake(0.18)
		e.BlockedEvents++
		e.syncBuffers()
		return false
	}

	color := e.Tiles[idx].Color
	direct := e.isActiveColor(color)
	if !direct && e.TrayLen >= TrayCapacity {
		e.Tiles[idx].WobbleT = 1.0
		e.LastTappedBlockedIdx = idx
		e.LastBlockerIdx = -1
		e.BlockerFlashT = 0.75
		e.addShake(0.24)
		e.BlockedEvents++
		e.updatePhase()
		e.syncBuffers()
		return false
	}

	e.undoStack = append(e.undoStack, e.captureUndoSnapshot())
	e.LastScoreDelta = 0
	e.LastTappedBlockedIdx = -1
	e.LastBlockerIdx = -1
	e.BlockerFlashT = 0

	sx, sz := e.tileWorldPos(e.Tiles[idx].Col, e.Tiles[idx].Row)
	switch e.Tiles[idx].Dir {
	case DirUp:
		sz -= 0.14
	case DirRight:
		sx += 0.14
	case DirDown:
		sz += 0.14
	case DirLeft:
		sx -= 0.14
	}

	e.Tiles[idx].Alive = false
	e.Tiles[idx].WobbleT = 0
	e.HintTileIdx = -1
	e.HintPulse = 0

	if direct {
		hoopIdx := e.claimHoopSlot(color)
		if hoopIdx >= 0 {
			hp := &e.HoopPearls[hoopIdx]
			e.spawnFlight(color, sx, 0.24, sz, hp.WorldX, 0.14, hp.WorldZ, 0, true, hoopIdx)
			e.Remain[color]--
			e.DirectCount++
			e.Streak++
			if e.Streak > e.MaxStreak {
				e.MaxStreak = e.Streak
			}
			pts := uint32(100) * e.currentMultiplier()
			e.Score += pts
			e.LastScoreDelta += pts
			e.LastEventWorldX = hp.WorldX
			e.LastEventWorldZ = hp.WorldZ
			e.StitchEvents++
			e.LastStitchCol = uint32(color)
			e.addShake(0.16 + float32(e.currentMultiplier())*0.025)

			if e.Remain[color] == 0 {
				e.triggerColorCleared(color)
			}
			e.checkLayerMilestones()
			e.refillActiveColors()
			e.drainTrayToHoop()
		}
	} else {
		slot := e.TrayLen
		e.Tray[slot] = color
		e.TrayLen++
		e.TrayUses++
		e.Streak = 0 // Using tray resets the Clean Direct-Stitch Streak!
		e.TrayPulse[slot] = 1.0
		ex, ez := e.traySlotWorldPos(slot)
		e.LastEventWorldX = ex
		e.LastEventWorldZ = ez
		e.spawnFlight(color, sx, 0.24, sz, ex, 0.20, ez, 0, false, slot)
		e.TrayEvents++
		e.drainTrayToHoop()
	}

	e.updatePhase()
	e.syncBuffers()
	return true
}

// Undo cleanly reverts the previous move (limitless, deducts 150 Luster Score and resets active streak).
func (e *Engine) Undo() bool {
	if len(e.undoStack) == 0 {
		return false
	}
	snap := e.undoStack[len(e.undoStack)-1]
	e.undoStack = e.undoStack[:len(e.undoStack)-1]

	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i].Alive = (snap.aliveMask & (uint64(1) << uint(i))) != 0
		e.Tiles[i].WobbleT = 0
	}
	for i := 0; i < e.HoopCount; i++ {
		claimed := (snap.claimedMask & (uint64(1) << uint(i))) != 0
		e.HoopPearls[i].Claimed = claimed
		e.HoopPearls[i].Stitched = claimed
		if claimed {
			e.HoopPearls[i].BloomT = 1.0
		} else {
			e.HoopPearls[i].BloomT = 0
		}
		e.HoopPearls[i].ShimmerPulse = 0
	}
	for i := range e.Flying {
		e.Flying[i].Active = false
	}

	e.Tray = snap.tray
	e.TrayLen = snap.trayLen
	e.Remain = snap.remain
	e.Active = snap.active
	e.QueuePos = snap.queuePos
	// Limitless Undo deducts UndoScorePenalty (150) clamped at 0 and resets active streak
	if snap.score > UndoScorePenalty {
		e.Score = snap.score - UndoScorePenalty
	} else {
		e.Score = 0
	}
	e.Streak = 0
	e.DirectCount = snap.directCount
	e.TrayUses = snap.trayUses
	e.LayerDone = snap.layerDone
	e.Phase = snap.phase
	e.UndoUsed++
	e.LastPenaltyDelta = UndoScorePenalty
	e.LayersComplete = 0
	for l := 0; l < MaxLayers; l++ {
		if e.LayerDone[l] {
			e.LayersComplete++
		}
	}
	e.HintTileIdx = -1
	e.HintPulse = 0
	e.CelebrateT = 0
	e.LastTappedBlockedIdx = -1
	e.LastBlockerIdx = -1
	e.BlockerFlashT = 0
	e.UndoEvents++

	e.syncBuffers()
	return true
}

// ComputeHint finds a guaranteed safe next tile from the live state using priority-guided search.
// Limitless in use: deducts HintScorePenalty (250) on each new highlighted hint.
// Returns HintNeedsUndo (-2) if the current board is in a dead-end pinch requiring Undo!
func (e *Engine) ComputeHint() int {
	if e.Phase == PhaseComplete {
		return -1
	}

	var aliveMask uint64
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive {
			aliveMask |= (uint64(1) << uint(i))
		}
	}

	st := solverState{
		aliveMask: aliveMask,
		tray:      e.Tray,
		trayLen:   e.TrayLen,
		remain:    e.Remain,
		active:    e.Active,
		queue:     e.ColorQueue,
		queueLen:  e.QueueLen,
		queuePos:  e.QueuePos,
	}

	ok, bestMove, exhausted := solveFromStateDetailed(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 16000)

	if ok && bestMove >= 0 {
		if bestMove != e.HintTileIdx {
			if e.Score > HintScorePenalty {
				e.Score -= HintScorePenalty
			} else {
				e.Score = 0
			}
			e.HintsUsed++
			e.LastPenaltyDelta = HintScorePenalty
		} else {
			e.LastPenaltyDelta = 0
		}
		e.HintTileIdx = bestMove
		e.HintPulse = 1.0
		e.HintEvents++
		e.syncBuffers()
		return bestMove
	}

	// If the search space was exhausted (provable dead end!) or the tray is full with no direct stitch,
	// signal HintNeedsUndo (-2) so the UI highlights Undo to rescue the player out of the pinch!
	if exhausted || e.TrayLen >= TrayCapacity {
		e.HintTileIdx = HintNeedsUndo
		e.HintPulse = 1.0
		e.LastPenaltyDelta = 0
		e.HintEvents++
		e.syncBuffers()
		return HintNeedsUndo
	}

	// Rare very deep board hit budget: pick the highest-value legal unblocked move so Hint never silently fails!
	fallback := pickBestHeuristicMove(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st)
	if fallback >= 0 {
		if fallback != e.HintTileIdx {
			if e.Score > HintScorePenalty {
				e.Score -= HintScorePenalty
			} else {
				e.Score = 0
			}
			e.HintsUsed++
			e.LastPenaltyDelta = HintScorePenalty
		} else {
			e.LastPenaltyDelta = 0
		}
		e.HintTileIdx = fallback
		e.HintPulse = 1.0
		e.HintEvents++
		e.syncBuffers()
		return fallback
	}

	e.HintTileIdx = HintNeedsUndo
	e.HintPulse = 1.0
	e.LastPenaltyDelta = 0
	e.HintEvents++
	e.syncBuffers()
	return HintNeedsUndo
}

// IsAnimating reports whether any pearl flight, wobble, bloom, shockwave, shake, or tension pulse needs 60 FPS.
func (e *Engine) IsAnimating() bool {
	if e.CelebrateT > 0.005 || e.HintTileIdx >= 0 || e.ShakeAmt > 0.005 ||
		e.ColorBurstPulse > 0.005 || e.LayerBurstPulse > 0.005 || e.BlockerFlashT > 0.005 {
		return true
	}
	for i := range e.Flying {
		if e.Flying[i].Active {
			return true
		}
	}
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].WobbleT > 0.005 {
			return true
		}
	}
	for i := 0; i < e.HoopCount; i++ {
		if (e.HoopPearls[i].Stitched && e.HoopPearls[i].BloomT < 0.995) || e.HoopPearls[i].ShimmerPulse > 0.005 {
			return true
		}
	}
	for i := 0; i < TrayCapacity; i++ {
		if e.TrayPulse[i] > 0.005 {
			return true
		}
	}
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > 0.005 {
			return true
		}
	}
	return false
}

// Step advances animations and updates GPU/telemetry buffers deterministically.
func (e *Engine) Step(dt float32) {
	if dt <= 0 {
		dt = FixedDT
	}
	if dt > 0.05 {
		dt = 0.05
	}

	e.FrameCount++
	e.ElapsedSec += dt

	// Smooth exponential decay on juice pulses, screenshake & temporary interior unlock glow (~2.2s)
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > 0 {
			e.ColorGlowT[c] -= dt * 0.45
			if e.ColorGlowT[c] < 0 {
				e.ColorGlowT[c] = 0
			}
		}
	}
	if e.ShakeAmt > 0 {
		e.ShakeAmt -= dt * 3.8
		if e.ShakeAmt < 0 {
			e.ShakeAmt = 0
		}
	}
	if e.ColorBurstPulse > 0 {
		e.ColorBurstPulse -= dt * 1.45
		if e.ColorBurstPulse < 0 {
			e.ColorBurstPulse = 0
		}
	}
	if e.LayerBurstPulse > 0 {
		e.LayerBurstPulse -= dt * 1.15
		if e.LayerBurstPulse < 0 {
			e.LayerBurstPulse = 0
		}
	}
	if e.BlockerFlashT > 0 {
		e.BlockerFlashT -= dt * 2.2
		if e.BlockerFlashT < 0 {
			e.BlockerFlashT = 0
			e.LastTappedBlockedIdx = -1
			e.LastBlockerIdx = -1
		}
	}

	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].WobbleT > 0 {
			e.Tiles[i].WobbleT -= dt * 3.2
			if e.Tiles[i].WobbleT < 0 {
				e.Tiles[i].WobbleT = 0
			}
		}
	}

	for i := range e.Flying {
		f := &e.Flying[i]
		if !f.Active {
			continue
		}
		if f.Delay > 0 {
			f.Delay -= dt
			continue
		}
		f.Progress += dt / f.Duration
		if f.Progress >= 1.0 {
			f.Active = false
			if f.ToHoop && f.TargetIndex >= 0 && f.TargetIndex < e.HoopCount {
				e.HoopPearls[f.TargetIndex].Stitched = true
				e.HoopPearls[f.TargetIndex].BloomT = 0.25
				e.HoopPearls[f.TargetIndex].ShimmerPulse = 1.0
			}
		}
	}

	for i := 0; i < e.HoopCount; i++ {
		hp := &e.HoopPearls[i]
		if hp.Stitched && hp.BloomT < 1.0 {
			hp.BloomT += dt * 4.8
			if hp.BloomT > 1.0 {
				hp.BloomT = 1.0
			}
		}
		if hp.ShimmerPulse > 0 {
			hp.ShimmerPulse -= dt * 1.65
			if hp.ShimmerPulse < 0 {
				hp.ShimmerPulse = 0
			}
		}
	}

	for i := range e.TrayPulse {
		if e.TrayPulse[i] > 0 {
			e.TrayPulse[i] -= dt * 2.5
			if e.TrayPulse[i] < 0 {
				e.TrayPulse[i] = 0
			}
		}
	}
	if e.CelebrateT > 0 {
		e.CelebrateT -= dt * 0.55
		if e.CelebrateT < 0 {
			e.CelebrateT = 0
		}
	}

	e.syncBuffers()
}

func easeOutCubic(t float32) float32 {
	u := 1.0 - t
	return 1.0 - u*u*u
}

func (e *Engine) syncBuffers() {
	solar := ComputeSolarLighting(e.TimeOfDayHours)
	palTable := ThemePalettes[e.ThemeIndex%NumThemes]
	tension := e.computeTrayTension()

	// Micro-screenshake offset scaled to ShakeAmt^2 for snappy physical feel
	shakeMag := e.ShakeAmt * e.ShakeAmt * 0.14
	shakeX := float32(math.Sin(float64(e.ElapsedSec)*78.0)) * shakeMag
	shakeZ := float32(math.Cos(float64(e.ElapsedSec)*64.0)) * shakeMag

	// --- Header (16 vec4s = 64 floats) ---
	// 0: cameraPos + elapsed
	e.Scene[0] = CamPosX + shakeX
	e.Scene[1] = CamPosY
	e.Scene[2] = CamPosZ + shakeZ
	e.Scene[3] = e.ElapsedSec

	// 1: cameraTarget + fovY
	e.Scene[4] = CamTargetX + shakeX*0.5
	e.Scene[5] = CamTargetY
	e.Scene[6] = CamTargetZ + shakeZ*0.5
	e.Scene[7] = CamFovY

	// 2: sunDir + sunIntensity
	e.Scene[8] = solar.SunDirX
	e.Scene[9] = solar.SunDirY
	e.Scene[10] = solar.SunDirZ
	e.Scene[11] = solar.SunIntensity

	// 3: sunColor + candleIntensity
	e.Scene[12] = solar.SunR
	e.Scene[13] = solar.SunG
	e.Scene[14] = solar.SunB
	e.Scene[15] = solar.CandleIntensity

	// 4: ambientSky + timeOfDayHours
	e.Scene[16] = solar.AmbientR
	e.Scene[17] = solar.AmbientG
	e.Scene[18] = solar.AmbientB
	e.Scene[19] = e.TimeOfDayHours

	// 5: deskTint + celebrateT
	e.Scene[20] = solar.DeskR
	e.Scene[21] = solar.DeskG
	e.Scene[22] = solar.DeskB
	e.Scene[23] = e.CelebrateT

	// 6: boardMeta
	e.Scene[24] = float32(e.GridCols)
	e.Scene[25] = float32(e.GridRows)
	e.Scene[26] = e.CellPitch
	e.Scene[27] = float32(e.TileCount)

	// 7: countsMeta
	flyingCount := 0
	for i := range e.Flying {
		if e.Flying[i].Active {
			flyingCount++
		}
	}
	e.Scene[28] = float32(e.HoopCount)
	e.Scene[29] = float32(e.TrayLen)
	e.Scene[30] = float32(flyingCount)
	e.Scene[31] = float32(e.Phase)

	// 8: activeColors (c0, c1, rem0, rem1)
	c0, c1 := e.Active[0], e.Active[1]
	r0, r1 := 0, 0
	if c0 >= 0 {
		r0 = e.Remain[c0]
	}
	if c1 >= 0 {
		r1 = e.Remain[c1]
	}
	e.Scene[32] = float32(c0)
	e.Scene[33] = float32(c1)
	e.Scene[34] = float32(r0)
	e.Scene[35] = float32(r1)

	// 9: boardBounds
	halfW := float32(e.GridCols) * e.CellPitch * 0.5
	halfD := float32(e.GridRows) * e.CellPitch * 0.5
	e.Scene[36] = BoardCenterX
	e.Scene[37] = BoardCenterZ
	e.Scene[38] = halfW
	e.Scene[39] = halfD

	// 10: hoopBounds + trayZ
	e.Scene[40] = HoopCenterX
	e.Scene[41] = HoopCenterZ
	e.Scene[42] = HoopRadius
	e.Scene[43] = TrayCenterZ

	// 11: themeAndSolar (themeIndex, daylightFactor, horizonWarmth, traySpacing)
	e.Scene[44] = float32(e.ThemeIndex)
	e.Scene[45] = solar.DaylightFactor
	e.Scene[46] = solar.HorizonWarmth
	e.Scene[47] = TraySpacing

	// 12: juiceFX (colorBurstPulse, colorBurstColor, layerBurstPulse, trayTension)
	e.Scene[48] = e.ColorBurstPulse
	e.Scene[49] = float32(e.ColorBurstColor)
	e.Scene[50] = e.LayerBurstPulse
	e.Scene[51] = tension

	// 13: blockerFX (tappedX, tappedZ, blockerX, blockerZ)
	txB, tzB, bxB, bzB := float32(0), float32(0), float32(0), float32(0)
	if e.BlockerFlashT > 0.01 && e.LastTappedBlockedIdx >= 0 && e.LastTappedBlockedIdx < e.TileCount {
		t0 := e.Tiles[e.LastTappedBlockedIdx]
		txB, tzB = e.tileWorldPos(t0.Col, t0.Row)
		if e.LastBlockerIdx >= 0 && e.LastBlockerIdx < e.TileCount {
			tb := e.Tiles[e.LastBlockerIdx]
			bxB, bzB = e.tileWorldPos(tb.Col, tb.Row)
		} else {
			bxB, bzB = txB, tzB
		}
	}
	e.Scene[52] = txB
	e.Scene[53] = tzB
	e.Scene[54] = bxB
	e.Scene[55] = bzB

	// 14: extraFX (blockerFlashT, streakFloat, layersDoneRatio, hintIdx)
	layerRatio := float32(0)
	if e.TotalLayers > 0 {
		layerRatio = float32(e.LayersComplete) / float32(e.TotalLayers)
	}
	e.Scene[56] = e.BlockerFlashT
	e.Scene[57] = float32(e.Streak)
	e.Scene[58] = layerRatio
	e.Scene[59] = float32(e.HintTileIdx)

	// 15: reserved
	e.Scene[60] = float32(e.currentMultiplier())
	e.Scene[61] = float32(e.nextQueuedColor())
	e.Scene[62] = float32(e.LevelIndex)
	e.Scene[63] = float32(TrayCapacity)

	// --- Palette (6 vec4s) ---
	for c := 0; c < NumColors; c++ {
		base := SceneHeaderFloats + c*4
		e.Scene[base+0] = palTable[c][0]
		e.Scene[base+1] = palTable[c][1]
		e.Scene[base+2] = palTable[c][2]
		e.Scene[base+3] = palTable[c][3]
	}

	// --- Board Tiles (49 * 8 floats) & TileTelemetry ---
	pearlRad := e.CellPitch * 0.245
	for i := 0; i < MaxGridTiles; i++ {
		sBase := SceneTileOffset + i*8
		tBase := i * TileTelemetryStride
		if i >= e.TileCount {
			for k := 0; k < 8; k++ {
				e.Scene[sBase+k] = 0
				e.TileTelemetry[tBase+k] = 0
			}
			continue
		}
		t := e.Tiles[i]
		wx, wz := e.tileWorldPos(t.Col, t.Row)
		unblocked := t.Alive && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows)

		ox, oz := float32(0), float32(0)
		if t.WobbleT > 0 {
			w := float32(math.Sin(float64(t.WobbleT)*math.Pi*3.0)) * t.WobbleT * 0.085
			switch t.Dir {
			case DirUp:
				oz = -w
			case DirRight:
				ox = w
			case DirDown:
				oz = w
			case DirLeft:
				ox = -w
			}
		}

		// IMPORTANT: Zero-spoiler flags!
		// Bit 1 = alive, Bit 4 = hinted, Bit 8 = blocker flash.
		// Temporary interior pearl glow (~2.2s on start & new color unlock) is passed via props.w!
		flags := uint32(0)
		if t.Alive {
			flags |= 1
		}
		if i == e.HintTileIdx {
			flags |= 4
		}
		if e.BlockerFlashT > 0.01 && (i == e.LastBlockerIdx || i == e.LastTappedBlockedIdx) {
			flags |= 8
		}

		e.Scene[sBase+0] = wx + ox
		e.Scene[sBase+1] = 0.22
		e.Scene[sBase+2] = wz + oz
		e.Scene[sBase+3] = pearlRad
		e.Scene[sBase+4] = float32(t.Color)
		e.Scene[sBase+5] = float32(t.Dir)
		e.Scene[sBase+6] = float32(flags)
		e.Scene[sBase+7] = e.ColorGlowT[t.Color]

		e.TileTelemetry[tBase+0] = float32(t.Col)
		e.TileTelemetry[tBase+1] = float32(t.Row)
		e.TileTelemetry[tBase+2] = float32(t.Color)
		e.TileTelemetry[tBase+3] = float32(t.Dir)
		if t.Alive {
			e.TileTelemetry[tBase+4] = 1
		} else {
			e.TileTelemetry[tBase+4] = 0
		}
		if unblocked {
			e.TileTelemetry[tBase+5] = 1
		} else {
			e.TileTelemetry[tBase+5] = 0
		}
		e.TileTelemetry[tBase+6] = wx
		e.TileTelemetry[tBase+7] = wz
	}

	// --- Embroidery Hoop Pearls (49 * 8 floats) ---
	stitchedCount := 0
	hoopPearlR := float32(0.125)
	if e.HoopCount > 34 {
		hoopPearlR = 0.105
	} else if e.HoopCount > 24 {
		hoopPearlR = 0.115
	}

	for i := 0; i < MaxHoopPearls; i++ {
		base := SceneHoopOffset + i*8
		if i >= e.HoopCount {
			for k := 0; k < 8; k++ {
				e.Scene[base+k] = 0
			}
			continue
		}
		hp := e.HoopPearls[i]
		if hp.Claimed {
			stitchedCount++
		}
		bloom := float32(0)
		if hp.Stitched {
			bloom = easeOutCubic(hp.BloomT)
		}
		activeFlag := float32(0)
		if !hp.Claimed && e.isActiveColor(hp.Color) {
			activeFlag = 1
		}

		e.Scene[base+0] = hp.WorldX
		e.Scene[base+1] = 0.08 + hoopPearlR*0.65*bloom
		e.Scene[base+2] = hp.WorldZ
		e.Scene[base+3] = hoopPearlR
		e.Scene[base+4] = float32(hp.Color)
		e.Scene[base+5] = bloom
		e.Scene[base+6] = hp.ShimmerPulse
		e.Scene[base+7] = activeFlag
	}

	// --- 5-Slot Silk Holding Tray Pearls ---
	for i := 0; i < TrayCapacity; i++ {
		base := SceneTrayOffset + i*8
		tx, tz := e.traySlotWorldPos(i)
		occupied := i < e.TrayLen
		inbound := false
		for fi := range e.Flying {
			if e.Flying[fi].Active && !e.Flying[fi].ToHoop && e.Flying[fi].TargetIndex == i {
				inbound = true
				break
			}
		}
		e.Scene[base+0] = tx
		e.Scene[base+1] = 0.19
		e.Scene[base+2] = tz
		e.Scene[base+3] = 0.175
		if occupied && !inbound {
			e.Scene[base+4] = float32(e.Tray[i])
			e.Scene[base+5] = 1
		} else {
			e.Scene[base+4] = 0
			e.Scene[base+5] = 0
		}
		e.Scene[base+6] = e.TrayPulse[i]
		e.Scene[base+7] = tension
	}

	// --- Flying Pearls (12 * 8 floats) ---
	for i := 0; i < MaxFlying; i++ {
		base := SceneFlyingOffset + i*8
		f := e.Flying[i]
		if !f.Active || f.Delay > 0 {
			for k := 0; k < 8; k++ {
				e.Scene[base+k] = 0
			}
			continue
		}
		t := easeOutCubic(f.Progress)
		inv := 1.0 - t
		px := inv*inv*f.StartX + 2*inv*t*f.CtrlX + t*t*f.EndX
		py := inv*inv*f.StartY + 2*inv*t*f.CtrlY + t*t*f.EndY
		pz := inv*inv*f.StartZ + 2*inv*t*f.CtrlZ + t*t*f.EndZ

		e.Scene[base+0] = px
		e.Scene[base+1] = py
		e.Scene[base+2] = pz
		e.Scene[base+3] = 0.165
		e.Scene[base+4] = float32(f.Color)
		e.Scene[base+5] = 1.0
		e.Scene[base+6] = t
		e.Scene[base+7] = 0
	}

	// --- Compact Telemetry State Buffer (48 floats) ---
	e.State[0] = float32(e.FrameCount)
	e.State[1] = e.ElapsedSec
	e.State[2] = float32(e.LevelIndex)
	e.State[3] = float32(e.Mode)
	e.State[4] = float32(e.Phase)
	e.State[5] = e.TimeOfDayHours
	if e.IsAnimating() {
		e.State[6] = 1
	} else {
		e.State[6] = 0
	}
	e.State[7] = float32(e.Score)
	e.State[8] = float32(len(e.undoStack))
	e.State[9] = float32(stitchedCount)
	e.State[10] = float32(e.HoopCount)
	e.State[11] = float32(e.Active[0])
	e.State[12] = float32(e.Active[1])
	e.State[13] = float32(r0)
	e.State[14] = float32(r1)
	e.State[15] = float32(e.TrayLen)
	for i := 0; i < TrayCapacity; i++ {
		if i < e.TrayLen {
			e.State[16+i] = float32(e.Tray[i])
		} else {
			e.State[16+i] = -1
		}
	}
	e.State[21] = float32(e.HintTileIdx)
	e.State[22] = float32(e.GridCols)
	e.State[23] = float32(e.GridRows)
	e.State[24] = float32(e.TileCount)
	e.State[25] = float32(e.StitchEvents)
	e.State[26] = float32(e.LastStitchCol)
	e.State[27] = float32(e.TrayEvents)
	e.State[28] = float32(e.BlockedEvents)
	e.State[29] = float32(e.UndoEvents)
	e.State[30] = float32(e.CompleteEvents)
	e.State[31] = solar.DaylightFactor

	// v2.0 Extended Balatro/VS telemetry
	e.State[32] = float32(e.ThemeIndex)
	e.State[33] = float32(e.Streak)
	e.State[34] = float32(e.MaxStreak)
	e.State[35] = float32(e.currentMultiplier())
	e.State[36] = float32(e.DirectCount)
	e.State[37] = float32(e.TrayUses)
	e.State[38] = float32(e.UndoUsed)
	e.State[39] = float32(e.Stars)
	e.State[40] = float32(e.LayersComplete)
	e.State[41] = float32(e.TotalLayers)
	e.State[42] = float32(e.ColorClearEvents)
	e.State[43] = float32(e.LayerClearEvents)
	e.State[44] = float32(e.LastScoreDelta)
	e.State[45] = float32(e.LastBlockerIdx)
	e.State[46] = e.LastEventWorldX
	e.State[47] = e.LastEventWorldZ
	e.State[48] = float32(e.HintsUsed)
	e.State[49] = float32(e.HintEvents)
	e.State[50] = float32(e.LastPenaltyDelta)
	e.State[51] = float32(e.ChapterIndex)
}
