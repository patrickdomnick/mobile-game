package sim

import "math"

const (
	MaxHoopPearls = 32
	MaxFlying     = 8

	// Scene buffer layout (all vec4<f32> aligned for WebGPU storage buffer)
	// Header: 12 * 4 = 48 floats
	// Palette: 6 * 4 = 24 floats
	// Tiles: 25 * 8 = 200 floats
	// HoopPearls: 32 * 8 = 256 floats
	// TrayPearls: 5 * 8 = 40 floats
	// FlyingPearls: 8 * 8 = 64 floats
	// Total = 632 floats (2,528 bytes)
	SceneHeaderFloats  = 48
	ScenePaletteFloats = NumColors * 4
	SceneTileOffset    = SceneHeaderFloats + ScenePaletteFloats
	SceneHoopOffset    = SceneTileOffset + MaxGridTiles*8
	SceneTrayOffset    = SceneHoopOffset + MaxHoopPearls*8
	SceneFlyingOffset  = SceneTrayOffset + TrayCapacity*8
	SceneFloats        = SceneFlyingOffset + MaxFlying*8

	// Telemetry / state buffer layout for JS & E2E bridge
	StateFloats = 32

	// Per-tile telemetry layout (25 * 8 = 200 floats):
	// [col, row, color, dir, alive, unblocked, worldX, worldZ]
	TileTelemetryStride = 8
	TileTelemetryFloats = MaxGridTiles * TileTelemetryStride

	// Phase constants
	PhasePlaying  = 0
	PhaseTrayFull = 1
	PhaseComplete = 2

	// World-space atelier geometry (portrait iPhone 16 layout on y=0 linen desk)
	CamPosX    = float32(0.0)
	CamPosY    = float32(12.6)
	CamPosZ    = float32(2.35)
	CamTargetX = float32(0.0)
	CamTargetY = float32(0.0)
	CamTargetZ = float32(0.25)
	CamFovY    = float32(0.72)

	HoopCenterX = float32(0.0)
	HoopCenterZ = float32(-1.82)
	HoopRadius  = float32(1.36)

	TrayCenterZ = float32(0.24)
	TraySpacing = float32(0.62)

	BoardCenterX = float32(0.0)
	BoardCenterZ = float32(2.26)
	BoardMaxSpan = float32(2.96)

	FixedDT = float32(1.0 / 60.0)
)

// HoopPearl tracks one embroidery stitch slot on the top hoop.
type HoopPearl struct {
	WorldX       float32
	WorldZ       float32
	Color        uint8
	Claimed      bool    // Reserved by an in-flight or already-stitched pearl
	Stitched     bool    // Landed on the hoop
	BloomT       float32 // 0 -> 1 landing bloom
	ShimmerPulse float32 // Decaying sparkle after arrival
}

// FlyingPearl animates a freed pearl gliding from board/tray to hoop/tray.
type FlyingPearl struct {
	Active       bool
	Color        uint8
	StartX       float32
	StartY       float32
	StartZ       float32
	CtrlX        float32
	CtrlY        float32
	CtrlZ        float32
	EndX         float32
	EndY         float32
	EndZ         float32
	Progress     float32
	Delay        float32
	Duration     float32
	ToHoop       bool
	TargetIndex  int
}

type undoSnapshot struct {
	aliveMask   uint32
	claimedMask uint32
	tray        [TrayCapacity]uint8
	trayLen     int
	remain      [NumColors]int
	active      [ActiveSlots]int
	queuePos    int
	moves       int
	phase       int
}

// Engine holds all deterministic Pearl Loom simulation state and flat GPU buffers.
type Engine struct {
	FrameCount     uint32
	ElapsedSec     float32
	TimeOfDayHours float32

	LevelIndex int
	Mode       int // 0=curated, 1=mandala, 2=daily
	Phase      int // PhasePlaying, PhaseTrayFull, PhaseComplete
	Moves      int

	GridCols  int
	GridRows  int
	CellPitch float32

	Tiles       [MaxGridTiles]Tile
	TileCount   int
	HoopPearls  [MaxHoopPearls]HoopPearl
	HoopCount   int
	Tray        [TrayCapacity]uint8
	TrayLen     int
	TrayPulse   [TrayCapacity]float32
	Flying      [MaxFlying]FlyingPearl

	ColorQueue  [NumColors]uint8
	QueueLen    int
	QueuePos    int
	Remain      [NumColors]int
	Active      [ActiveSlots]int

	HintTileIdx int
	HintPulse   float32
	CelebrateT  float32

	// Audio event counters consumed by procedural Web Audio engine
	StitchEvents   uint32
	LastStitchCol  uint32
	TrayEvents     uint32
	BlockedEvents  uint32
	UndoEvents     uint32
	CompleteEvents uint32

	undoStack []undoSnapshot

	Scene         [SceneFloats]float32
	State         [StateFloats]float32
	TileTelemetry [TileTelemetryFloats]float32
}

// Reset reloads the current level (defaulting to curated level 0 if uninitialized).
func (e *Engine) Reset() {
	if e.TimeOfDayHours <= 0 {
		e.TimeOfDayHours = 11.5 // Warm late-morning sunlit atelier default until clock sync
	}
	if e.LevelIndex < 0 || e.LevelIndex >= len(CuratedArtworks) {
		e.LevelIndex = 0
	}
	e.LoadCuratedLevel(e.LevelIndex)
}

// LoadCuratedLevel initializes one of the handcrafted embroidery artworks.
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
	e.loadArtwork(CuratedArtworks[idx])
}

func (e *Engine) loadArtwork(art ArtworkDef) {
	e.Phase = PhasePlaying
	e.Moves = 0
	e.GridCols = art.Cols
	e.GridRows = art.Rows
	e.TrayLen = 0
	e.HintTileIdx = -1
	e.HintPulse = 0
	e.CelebrateT = 0
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
	if e.CellPitch > 0.86 {
		e.CellPitch = 0.86
	}

	// Build guaranteed-solvable board
	tiles, colorOrder, colorCount := generateSolvableBoard(art)
	e.TileCount = len(tiles)
	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i] = tiles[i]
	}

	// Populate embroidery hoop stitch points
	e.HoopCount = len(art.Stitches)
	if e.HoopCount > MaxHoopPearls {
		e.HoopCount = MaxHoopPearls
	}
	for c := 0; c < NumColors; c++ {
		e.Remain[c] = 0
	}
	for i := 0; i < e.HoopCount; i++ {
		sp := art.Stitches[i]
		e.HoopPearls[i] = HoopPearl{
			WorldX: HoopCenterX + sp.X*(HoopRadius*0.84),
			WorldZ: HoopCenterZ + sp.Z*(HoopRadius*0.84),
			Color:  sp.Color,
		}
		e.Remain[sp.Color]++
	}

	e.ColorQueue = colorOrder
	e.QueueLen = colorCount
	e.QueuePos = 0
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

func (e *Engine) refillActiveColors() {
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] >= 0 && e.Remain[e.Active[i]] > 0 {
			continue
		}
		e.Active[i] = -1
		for e.QueuePos < e.QueueLen {
			c := int(e.ColorQueue[e.QueuePos])
			e.QueuePos++
			if e.Remain[c] > 0 {
				e.Active[i] = c
				break
			}
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
	for i := 0; i < e.HoopCount; i++ {
		if !e.HoopPearls[i].Claimed && e.HoopPearls[i].Color == color {
			e.HoopPearls[i].Claimed = true
			return i
		}
	}
	return -1
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
		// Instant fallback if flight pool is saturated
		if toHoop && targetIdx >= 0 && targetIdx < e.HoopCount {
			e.HoopPearls[targetIdx].Stitched = true
			e.HoopPearls[targetIdx].BloomT = 1.0
			e.HoopPearls[targetIdx].ShimmerPulse = 1.0
		}
		return
	}

	ctrlX := (sx+ex)*0.5 + (ex-sx)*0.12
	ctrlZ := (sz + ez) * 0.5
	ctrlY := float32(1.45)
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
		Duration:    0.34,
		ToHoop:      toHoop,
		TargetIndex: targetIdx,
	}
}

func (e *Engine) captureUndoSnapshot() undoSnapshot {
	var aliveMask uint32
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive {
			aliveMask |= (1 << uint(i))
		}
	}
	var claimedMask uint32
	for i := 0; i < e.HoopCount; i++ {
		if e.HoopPearls[i].Claimed {
			claimedMask |= (1 << uint(i))
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
		moves:       e.Moves,
		phase:       e.Phase,
	}
}

func (e *Engine) drainTrayToHoop() {
	stagger := float32(0.06)
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
					stagger += 0.07
					e.Remain[c]--
					e.StitchEvents++
					e.LastStitchCol = uint32(c)
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
			e.CompleteEvents++
		}
		return
	}

	// Check if tray is full AND no unblocked tile matches an active color
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

	if !isTileUnblocked(e.Tiles[:e.TileCount], idx, e.GridCols, e.GridRows) {
		// Gentle physical recoil wobble — zero penalty!
		e.Tiles[idx].WobbleT = 1.0
		e.BlockedEvents++
		e.syncBuffers()
		return false
	}

	color := e.Tiles[idx].Color
	direct := e.isActiveColor(color)
	if !direct && e.TrayLen >= TrayCapacity {
		// Tray is full for non-matching colors — soft wobble and calm tray-full prompt
		e.Tiles[idx].WobbleT = 1.0
		e.BlockedEvents++
		e.updatePhase()
		e.syncBuffers()
		return false
	}

	// Save exact undo checkpoint before mutating state
	e.undoStack = append(e.undoStack, e.captureUndoSnapshot())

	sx, sz := e.tileWorldPos(e.Tiles[idx].Col, e.Tiles[idx].Row)
	// Slight launch offset in arrow direction for juicy tactile take-off
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
	e.Moves++
	e.HintTileIdx = -1
	e.HintPulse = 0

	if direct {
		hoopIdx := e.claimHoopSlot(color)
		if hoopIdx >= 0 {
			hp := &e.HoopPearls[hoopIdx]
			e.spawnFlight(color, sx, 0.24, sz, hp.WorldX, 0.14, hp.WorldZ, 0, true, hoopIdx)
			e.Remain[color]--
			e.StitchEvents++
			e.LastStitchCol = uint32(color)
			e.refillActiveColors()
			e.drainTrayToHoop()
		}
	} else {
		slot := e.TrayLen
		e.Tray[slot] = color
		e.TrayLen++
		e.TrayPulse[slot] = 1.0
		ex, ez := e.traySlotWorldPos(slot)
		e.spawnFlight(color, sx, 0.24, sz, ex, 0.20, ez, 0, false, slot)
		e.TrayEvents++
		e.drainTrayToHoop()
	}

	e.updatePhase()
	e.syncBuffers()
	return true
}

// Undo cleanly reverts the previous move (unlimited, zero friction).
func (e *Engine) Undo() bool {
	if len(e.undoStack) == 0 {
		return false
	}
	snap := e.undoStack[len(e.undoStack)-1]
	e.undoStack = e.undoStack[:len(e.undoStack)-1]

	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i].Alive = (snap.aliveMask & (1 << uint(i))) != 0
		e.Tiles[i].WobbleT = 0
	}
	for i := 0; i < e.HoopCount; i++ {
		claimed := (snap.claimedMask & (1 << uint(i))) != 0
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
	e.Moves = snap.moves
	e.Phase = snap.phase
	e.HintTileIdx = -1
	e.HintPulse = 0
	e.CelebrateT = 0
	e.UndoEvents++

	e.syncBuffers()
	return true
}

// ComputeHint finds a guaranteed safe next tile from the live state and lights a calm golden halo.
func (e *Engine) ComputeHint() int {
	if e.Phase == PhaseComplete {
		return -1
	}

	var aliveMask uint32
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive {
			aliveMask |= (1 << uint(i))
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

	ok, bestMove := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 4000)
	if !ok || bestMove < 0 {
		// Fallback: highlight any unblocked direct stitch if available
		for i := 0; i < e.TileCount; i++ {
			if e.Tiles[i].Alive && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) && e.isActiveColor(e.Tiles[i].Color) {
				bestMove = i
				break
			}
		}
	}

	e.HintTileIdx = bestMove
	if bestMove >= 0 {
		e.HintPulse = 1.0
	}
	e.syncBuffers()
	return bestMove
}

// IsAnimating reports whether any pearl flight, wobble, bloom, hint, or celebration needs 60 FPS.
func (e *Engine) IsAnimating() bool {
	if e.CelebrateT > 0.005 || e.HintTileIdx >= 0 {
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

	// Decay blocked wobbles
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].WobbleT > 0 {
			e.Tiles[i].WobbleT -= dt * 3.2
			if e.Tiles[i].WobbleT < 0 {
				e.Tiles[i].WobbleT = 0
			}
		}
	}

	// Advance flying pearls along smooth cubic/quadratic Bezier arcs
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

	// Smooth pearl bloom & shimmer decay on embroidery hoop
	for i := 0; i < e.HoopCount; i++ {
		hp := &e.HoopPearls[i]
		if hp.Stitched && hp.BloomT < 1.0 {
			hp.BloomT += dt * 4.5
			if hp.BloomT > 1.0 {
				hp.BloomT = 1.0
			}
		}
		if hp.ShimmerPulse > 0 {
			hp.ShimmerPulse -= dt * 1.6
			if hp.ShimmerPulse < 0 {
				hp.ShimmerPulse = 0
			}
		}
	}

	// Decay tray pulses & celebration shimmer
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

	// --- Header (12 vec4s = 48 floats) ---
	// 0: cameraPos + elapsed
	e.Scene[0] = CamPosX
	e.Scene[1] = CamPosY
	e.Scene[2] = CamPosZ
	e.Scene[3] = e.ElapsedSec

	// 1: cameraTarget + fovY
	e.Scene[4] = CamTargetX
	e.Scene[5] = CamTargetY
	e.Scene[6] = CamTargetZ
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

	// 5: linenTint + celebrateT
	e.Scene[20] = solar.LinenR
	e.Scene[21] = solar.LinenG
	e.Scene[22] = solar.LinenB
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

	// 11: hintInfo
	e.Scene[44] = float32(e.HintTileIdx)
	e.Scene[45] = TraySpacing
	e.Scene[46] = float32(TrayCapacity)
	e.Scene[47] = float32(e.LevelIndex)

	// --- Palette (6 vec4s) ---
	for c := 0; c < NumColors; c++ {
		base := SceneHeaderFloats + c*4
		e.Scene[base+0] = PearlPalette[c][0]
		e.Scene[base+1] = PearlPalette[c][1]
		e.Scene[base+2] = PearlPalette[c][2]
		e.Scene[base+3] = PearlPalette[c][3]
	}

	// --- Board Tiles (25 * 8 floats) & TileTelemetry ---
	pearlRad := e.CellPitch * 0.235
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

		// Apply gentle damped wobble offset along arrow direction if tapped while blocked
		ox, oz := float32(0), float32(0)
		if t.WobbleT > 0 {
			w := float32(math.Sin(float64(t.WobbleT)*math.Pi*3.0)) * t.WobbleT * 0.08
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

		flags := uint32(0)
		if t.Alive {
			flags |= 1
		}
		if unblocked {
			flags |= 2
		}
		if i == e.HintTileIdx {
			flags |= 4
		}

		e.Scene[sBase+0] = wx + ox
		e.Scene[sBase+1] = 0.22
		e.Scene[sBase+2] = wz + oz
		e.Scene[sBase+3] = pearlRad
		e.Scene[sBase+4] = float32(t.Color)
		e.Scene[sBase+5] = float32(t.Dir)
		e.Scene[sBase+6] = float32(flags)
		e.Scene[sBase+7] = t.WobbleT

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

	// --- Embroidery Hoop Pearls (32 * 8 floats) ---
	stitchedCount := 0
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
		hoopPearlR := float32(0.145)
		if e.HoopCount > 18 {
			hoopPearlR = 0.12
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
		// Hide tray pearl until its inbound flight finishes if currently flying into this slot
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
		e.Scene[base+7] = 0
	}

	// --- Flying Pearls ---
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
		e.Scene[base+3] = 0.175
		e.Scene[base+4] = float32(f.Color)
		e.Scene[base+5] = 1.0
		e.Scene[base+6] = t
		e.Scene[base+7] = 0
	}

	// --- Compact Telemetry State Buffer (32 floats) ---
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
	e.State[7] = float32(e.Moves)
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
	e.State[31] = solar.SunIntensity
}
