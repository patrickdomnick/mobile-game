package sim

import "math"

const (
	MaxHoopPearls = 64
	MaxFlying     = 12
	MaxLayers     = 3

	// Scene buffer layout (all vec4<f32> aligned for WebGPU storage buffer)
	// Header:       16 * 4 = 64 floats
	// Palette:       6 * 4 = 24 floats
	// Tiles:        64 * 8 = 512 floats
	// HoopPearls:   64 * 8 = 512 floats
	// TrayPearls:    5 * 8 = 40 floats
	// FlyingPearls: 12 * 8 = 96 floats
	// Total = 1248 floats (4,992 bytes)
	SceneHeaderFloats  = 64
	ScenePaletteFloats = NumColors * 4
	SceneTileOffset    = SceneHeaderFloats + ScenePaletteFloats
	SceneHoopOffset    = SceneTileOffset + MaxGridTiles*8
	SceneTrayOffset    = SceneHoopOffset + MaxHoopPearls*8
	SceneFlyingOffset  = SceneTrayOffset + TrayCapacity*8
	SceneFloats        = SceneFlyingOffset + MaxFlying*8

	// Telemetry / state buffer layout for JS & E2E bridge (68 floats incl. seed halves, Special Pearl events & intro state)
	StateFloats          = 68
	MaxHeartsPerLevel    = 3
	CustomLevelHeaderLen = 14
	CustomLevelBufFloats = CustomLevelHeaderLen + MaxHoopPearls*4

	// Live remote config.json tuning parameter indices (updated via sim_set_tuning without rebuilding!)
	TuningLoadDelay       = 0
	TuningUnlockDelay     = 1
	TuningJiggleIntensity = 2
	TuningTopLight        = 3
	TuningGlowIntensity   = 4
	TuningShakeIntensity  = 5
	TuningHeartBonusMax   = 6
	TuningHeartBonusMin   = 7
	TuningHintPenalty     = 8
	TuningUndoPenalty     = 9

	// Per-tile telemetry layout (64 * 8 = 512 floats):
	// [col, row, color, dir, state(0=dead,1=normal,2=heart,3=rainbow,4=hidden,5=revealed,6=locked,7=unlocked), playable, worldX, worldZ]
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

// Tuning holds live-configurable feel, lighting, and scoring multipliers loaded from public/config.json.
type Tuning struct {
	Initialized     bool
	LoadDelaySec    float32
	UnlockDelaySec  float32
	JiggleIntensity float32
	TopLight        float32
	GlowIntensity   float32
	ShakeIntensity  float32
	HeartBonusMax   uint32
	HeartBonusMin   uint32
	HintPenalty     uint32
	UndoPenalty     uint32
}

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

// FlyingPearl animates a freed pearl gliding from board/tray to hoop/tray, or unraveling hoop -> board tile.
type FlyingPearl struct {
	Active      bool
	Color       uint8
	Special     uint8
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
	ToTile      bool
	TargetIndex int
}

type undoSnapshot struct {
	aliveMask    uint64
	claimedMask  uint64
	revealedMask uint64
	unlockedMask uint64
	tray         [TrayCapacity]uint8
	trayHeart    [TrayCapacity]bool
	trayLen      int
	remain       [NumColors]int
	active       [ActiveSlots]int
	queuePos     int
	score        uint32
	streak       uint32
	directCount  int
	trayUses     int
	layerDone    [MaxLayers]bool
	phase        int
}

// Engine holds all deterministic Pearl Loom state, scoring, Special Pearls,
// live config.json tuning, 4 vivid themes, 24h solar clock, blocker causal feedback, and flat GPU buffers.
type Engine struct {
	FrameCount     uint32
	ElapsedSec     float32
	TimeOfDayHours float32
	ThemeIndex     int

	LevelIndex        int
	ChapterIndex      int
	Mode              int // 0=curated, 1=mandala/random, 2=daily, 3=custom
	SeedDifficulty    int // 0=Easy 5x5, 1=Medium 6x6, 2=Hard 7x7, 3=Extreme 8x8
	CustomSpecialMask uint32
	Phase             int
	LastSeed          uint32
	hasCustomLevel    bool
	lastCustomArt     ArtworkDef
	Tuning            Tuning

	// First-load 3D Unravel Intro Animation state (zero GPU ABI overhead!)
	IntroActive       bool
	IntroElapsed      float32
	IntroDuration     float32
	IntroHiddenMask   uint64
	IntroTileForHoop  [MaxHoopPearls]int
	IntroLaunchTime   [MaxHoopPearls]float32
	IntroLaunchedMask uint64

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
	LastHeartBonus  uint32
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
	TrayHeart  [TrayCapacity]bool
	TrayLen    int
	TrayPulse  [TrayCapacity]float32
	Flying     [MaxFlying]FlyingPearl

	ColorQueue           [NumColors]uint8
	QueueLen             int
	QueuePos             int
	Remain               [NumColors]int
	Active               [ActiveSlots]int
	ColorGlowT           [NumColors]float32
	wiggleRng            prng
	lastWiggleIdx        int
	lastRainbowWiggleIdx int

	HintTileIdx       int
	HintPulse         float32
	AutoQueue         [MaxGridTiles]int
	AutoQueueLen      int
	AutoQueueCooldown float32

	// Event counters consumed by procedural Web Audio + floating score popups + haptics
	StitchEvents       uint32
	LastStitchCol      uint32
	CascadeEvents      uint32
	TrayEvents         uint32
	BlockedEvents      uint32
	UndoEvents         uint32
	HintEvents         uint32
	ColorClearEvents   uint32
	LastColorCleared   uint32
	LayerClearEvents   uint32
	HeartClearEvents   uint32
	RainbowClearEvents uint32
	HiddenRevealEvents uint32
	LockBreakEvents    uint32
	LockedTapEvents    uint32
	QueueEvents        uint32
	CompleteEvents     uint32

	undoStack []undoSnapshot

	Scene          [SceneFloats]float32
	State          [StateFloats]float32
	TileTelemetry  [TileTelemetryFloats]float32
	CustomLevelBuf [CustomLevelBufFloats]float32
}

func (e *Engine) ensureTuningDefaults() {
	if e.Tuning.Initialized {
		return
	}
	e.Tuning = Tuning{
		Initialized:     true,
		LoadDelaySec:    0.70,
		UnlockDelaySec:  0.85,
		JiggleIntensity: 1.0,
		TopLight:        1.0,
		GlowIntensity:   1.0,
		ShakeIntensity:  1.0,
		HeartBonusMax:   600,
		HeartBonusMin:   150,
		HintPenalty:     HintScorePenalty,
		UndoPenalty:     UndoScorePenalty,
	}
}

// SetTuning updates one live-configurable parameter from public/config.json without rebuilding WASM!
func (e *Engine) SetTuning(paramID int, val float32) {
	e.ensureTuningDefaults()
	clampF := func(v, lo, hi float32) float32 {
		if v < lo {
			return lo
		}
		if v > hi {
			return hi
		}
		return v
	}
	switch paramID {
	case TuningLoadDelay:
		e.Tuning.LoadDelaySec = clampF(val, 0.0, 4.0)
	case TuningUnlockDelay:
		e.Tuning.UnlockDelaySec = clampF(val, 0.0, 4.0)
	case TuningJiggleIntensity:
		e.Tuning.JiggleIntensity = clampF(val, 0.0, 2.5)
	case TuningTopLight:
		e.Tuning.TopLight = clampF(val, 0.25, 2.5)
	case TuningGlowIntensity:
		e.Tuning.GlowIntensity = clampF(val, 0.0, 2.5)
	case TuningShakeIntensity:
		e.Tuning.ShakeIntensity = clampF(val, 0.0, 2.5)
	case TuningHeartBonusMax:
		if val >= 50 && val <= 5000 {
			e.Tuning.HeartBonusMax = uint32(val)
		}
	case TuningHeartBonusMin:
		if val >= 0 && val <= 2000 {
			e.Tuning.HeartBonusMin = uint32(val)
		}
	case TuningHintPenalty:
		if val >= 0 && val <= 2000 {
			e.Tuning.HintPenalty = uint32(val)
		}
	case TuningUndoPenalty:
		if val >= 0 && val <= 2000 {
			e.Tuning.UndoPenalty = uint32(val)
		}
	}
	e.syncBuffers()
}

// Reset reloads the current level/mode cleanly (replaying the same Daily/Mandala/Custom JSON level if active).
func (e *Engine) Reset() {
	e.ensureTuningDefaults()
	if e.TimeOfDayHours <= 0 {
		e.TimeOfDayHours = 12.5
	}
	if e.Mode == 1 && e.LastSeed > 0 {
		e.LoadMandalaWithDifficulty(e.LastSeed, e.SeedDifficulty)
		return
	}
	if e.Mode == 2 && e.LastSeed > 0 {
		e.LoadDaily(e.LastSeed)
		return
	}
	if e.Mode == 0 && e.hasCustomLevel {
		e.loadArtwork(e.lastCustomArt)
		return
	}
	if e.LevelIndex < 0 || e.LevelIndex >= len(CuratedArtworks) {
		e.LevelIndex = 0
	}
	e.LoadCuratedLevel(e.LevelIndex)
}

// SetTheme switches the active visual theme (0..3) immediately (retained for diagnostics/tests).
func (e *Engine) SetTheme(idx int) {
	if idx < 0 {
		idx = 0
	}
	e.ThemeIndex = idx % NumThemes
	e.syncBuffers()
}

// LoadCuratedLevel initializes one of the built-in curated patterns across 4 Chapters.
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
	e.hasCustomLevel = false
	e.loadArtwork(CuratedArtworks[idx])
}

// LoadCustomLevel loads a curated level parsed from remote/cached levels.json via CustomLevelBuf.
// Staging layout (14-float header):
// [id, chapter, theme, cols, rows, difficulty, seedLo, seedHi, flags(bit0=noBlockers), maxHearts, maxRainbows, maxHidden, maxLocked, reserved, ...stitches(x,z,color,layer)].
func (e *Engine) LoadCustomLevel(stitchCount int) bool {
	if stitchCount < 1 || stitchCount > MaxHoopPearls {
		return false
	}
	id := int(e.CustomLevelBuf[0])
	chapter := int(e.CustomLevelBuf[1])
	theme := int(e.CustomLevelBuf[2])
	cols := int(e.CustomLevelBuf[3])
	rows := int(e.CustomLevelBuf[4])
	difficulty := int(e.CustomLevelBuf[5])
	seedLo := uint32(e.CustomLevelBuf[6]) & 0xFFFF
	seedHi := uint32(e.CustomLevelBuf[7]) & 0xFFFF
	flags := uint32(e.CustomLevelBuf[8])
	maxHearts := int(e.CustomLevelBuf[9])
	maxRainbows := int(e.CustomLevelBuf[10])
	maxHidden := int(e.CustomLevelBuf[11])
	maxLocked := int(e.CustomLevelBuf[12])

	if cols < 2 || rows < 2 || cols*rows < stitchCount || cols*rows > MaxGridTiles {
		return false
	}
	if chapter < 0 {
		chapter = 0
	}
	if theme < 0 {
		theme = 0
	}
	if difficulty < 0 {
		difficulty = 0
	}
	seed := seedLo | (seedHi << 16)
	if seed == 0 {
		seed = uint32(id+1) * 1009
	}

	stitches := make([]StitchPoint, stitchCount)
	for i := 0; i < stitchCount; i++ {
		off := CustomLevelHeaderLen + i*4
		col := int(e.CustomLevelBuf[off+2])
		if col < 0 || col >= NumColors {
			col = 0
		}
		layer := int(e.CustomLevelBuf[off+3])
		if layer < 0 {
			layer = 0
		}
		if layer >= MaxLayers {
			layer = MaxLayers - 1
		}
		stitches[i] = StitchPoint{
			X:     e.CustomLevelBuf[off+0],
			Z:     e.CustomLevelBuf[off+1],
			Color: uint8(col),
			Layer: uint8(layer),
		}
	}

	art := ArtworkDef{
		ID:          id,
		Chapter:     chapter,
		Theme:       theme % NumThemes,
		Cols:        cols,
		Rows:        rows,
		Difficulty:  difficulty,
		Seed:        seed,
		NoBlockers:  (flags & 1) != 0,
		MaxHearts:   maxHearts,
		MaxRainbows: maxRainbows,
		MaxHidden:   maxHidden,
		MaxLocked:   maxLocked,
		Stitches:    stitches,
	}
	e.LevelIndex = id
	e.Mode = 0
	e.LastSeed = seed
	e.hasCustomLevel = true
	e.lastCustomArt = art
	e.loadArtwork(art)
	return true
}

// LoadMandalaStyled procedurally generates a verified 3-star puzzle for any uint32 seed, difficulty tier (0..3),
// and optional explicit theme override (theme < 0 picks deterministic seed-derived theme).
func (e *Engine) LoadMandalaStyled(seed uint32, diffTier int, theme int) {
	if seed == 0 {
		seed = 1
	}
	if diffTier < SeedDiffEasy {
		diffTier = SeedDiffEasy
	}
	if diffTier > SeedDiffExtreme {
		diffTier = SeedDiffExtreme
	}
	e.LevelIndex = int(seed & 0x7FFF)
	e.Mode = 1
	e.SeedDifficulty = diffTier
	e.CustomSpecialMask = 0
	e.LastSeed = seed
	e.hasCustomLevel = false
	if theme < 0 || theme >= NumThemes {
		theme = ThemeForMandala(seed)
	}
	e.loadArtwork(GenerateMandalaArtworkWithDifficulty(seed, theme, diffTier))
}

// LoadMandalaWithDifficulty procedurally generates a verified 3-star puzzle for any uint32 seed and difficulty tier (0..3).
func (e *Engine) LoadMandalaWithDifficulty(seed uint32, diffTier int) {
	e.LoadMandalaStyled(seed, diffTier, -1)
}

// LoadMandala procedurally generates a default Medium (6x6) seeded puzzle (backward compatible).
func (e *Engine) LoadMandala(seed uint32) {
	e.LoadMandalaStyled(seed, SeedDiffMedium, -1)
}

// LoadDaily loads the deterministic calendar-seeded Daily Stitch (Medium 6x6 with Hearts + Rainbow!).
func (e *Engine) LoadDaily(dateKey uint32) {
	if dateKey == 0 {
		dateKey = 20261125
	}
	e.LevelIndex = int(dateKey % 100000)
	e.Mode = 2
	e.SeedDifficulty = SeedDiffMedium
	e.CustomSpecialMask = 0
	e.LastSeed = dateKey
	e.hasCustomLevel = false
	theme := ThemeForDaily(dateKey)
	e.loadArtwork(GenerateMandalaArtworkWithDifficulty(dateKey, theme, SeedDiffMedium))
}

// LoadCustomGenerated creates a verified 3-star custom sandbox pattern (5x5..8x8, 3..6 colors, custom specials & style).
func (e *Engine) LoadCustomGenerated(seed uint32, theme, cols, rows, colorCount int, specialMask uint32) {
	if seed == 0 {
		seed = 1
	}
	if theme < 0 || theme >= NumThemes {
		theme = ThemeForMandala(seed)
	}
	e.LevelIndex = int(seed & 0x7FFF)
	e.Mode = 3
	e.CustomSpecialMask = specialMask & 0x0F
	e.LastSeed = seed
	e.hasCustomLevel = false
	art := GenerateCustomArtwork(seed, theme, cols, rows, colorCount, specialMask)
	e.lastCustomArt = art
	e.loadArtwork(art)
}

// StartIntroUnravel prepares the first-load 3D animation on Level 1 (Sunbeam Brooch):
// the embroidery starts fully stitched on the hoop while board tiles are hidden, then pearls
// gracefully peel off the hoop outside-in and arc down onto the board tiles!
func (e *Engine) StartIntroUnravel() {
	if e.Mode != 0 || e.LevelIndex != 0 || e.HoopCount == 0 {
		e.LoadCuratedLevel(0)
	}
	e.IntroActive = true
	e.IntroElapsed = 0
	e.IntroHiddenMask = 0
	e.IntroLaunchedMask = 0

	// Pair each hoop pearl 1-to-1 with a matching-color tile on the board
	var usedTile uint64
	for h := 0; h < e.HoopCount; h++ {
		e.IntroTileForHoop[h] = -1
		targetCol := e.HoopPearls[h].Color
		for ti := 0; ti < e.TileCount; ti++ {
			if (usedTile&(uint64(1)<<uint(ti))) != 0 {
				continue
			}
			if e.Tiles[ti].Color == targetCol {
				usedTile |= (uint64(1) << uint(ti))
				e.IntroTileForHoop[h] = ti
				break
			}
		}
		// Fallback to any remaining tile if counts ever differed
		if e.IntroTileForHoop[h] < 0 {
			for ti := 0; ti < e.TileCount; ti++ {
				if (usedTile&(uint64(1)<<uint(ti))) == 0 {
					usedTile |= (uint64(1) << uint(ti))
					e.IntroTileForHoop[h] = ti
					break
				}
			}
		}
		if e.IntroTileForHoop[h] >= 0 {
			e.IntroHiddenMask |= (uint64(1) << uint(e.IntroTileForHoop[h]))
		}
		e.HoopPearls[h].Stitched = true
		e.HoopPearls[h].BloomT = 1.0
		e.HoopPearls[h].ShimmerPulse = 0.25
		e.HoopPearls[h].Claimed = false
	}

	// Sort hoop indices outer-to-inner so the finished brooch unravels cleanly from rim to core
	var order [MaxHoopPearls]int
	var distSq [MaxHoopPearls]float32
	for h := 0; h < e.HoopCount; h++ {
		order[h] = h
		dx := e.HoopPearls[h].WorldX - HoopCenterX
		dz := e.HoopPearls[h].WorldZ - HoopCenterZ
		distSq[h] = dx*dx + dz*dz
	}
	for i := 1; i < e.HoopCount; i++ {
		key := order[i]
		kd := distSq[key]
		j := i - 1
		for j >= 0 && distSq[order[j]] < kd {
			order[j+1] = order[j]
			j--
		}
		order[j+1] = key
	}

	const holdSec = float32(0.85)
	const stepSec = float32(0.10)
	const flightSec = float32(0.32)
	for rank := 0; rank < e.HoopCount; rank++ {
		h := order[rank]
		e.IntroLaunchTime[h] = holdSec + float32(rank)*stepSec
	}
	e.IntroDuration = holdSec + float32(e.HoopCount)*stepSec + flightSec

	// Keep tiles calm until unravel finishes
	for c := 0; c < NumColors; c++ {
		e.ColorGlowT[c] = 0
	}
	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i].JiggleDelay = 0
		e.Tiles[i].JiggleT = 0
	}
	for i := range e.Flying {
		e.Flying[i].Active = false
		e.Flying[i].ToTile = false
	}
	e.syncBuffers()
}

// SkipIntroUnravel immediately finishes the 3D unravel intro, revealing all Level 1 board tiles.
func (e *Engine) SkipIntroUnravel() {
	if !e.IntroActive {
		return
	}
	e.IntroActive = false
	e.IntroHiddenMask = 0
	e.IntroLaunchedMask = ^uint64(0)
	for h := 0; h < e.HoopCount; h++ {
		e.HoopPearls[h].Stitched = false
		e.HoopPearls[h].BloomT = 0
		e.HoopPearls[h].ShimmerPulse = 0
		e.HoopPearls[h].Claimed = false
	}
	for i := range e.Flying {
		if e.Flying[i].ToTile {
			e.Flying[i].Active = false
			e.Flying[i].ToTile = false
		}
	}
	for slot := 0; slot < ActiveSlots; slot++ {
		c := e.Active[slot]
		if c >= 0 && c < NumColors && e.Remain[c] > 0 {
			e.ColorGlowT[c] = 1.0
			e.triggerColorJiggle(uint8(c), 0.35)
		}
	}
	e.syncBuffers()
}

func (e *Engine) loadArtwork(art ArtworkDef) {
	e.IntroActive = false
	e.IntroElapsed = 0
	e.IntroDuration = 0
	e.IntroHiddenMask = 0
	e.IntroLaunchedMask = 0
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
	e.LastHeartBonus = 0
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
		e.Flying[i].ToTile = false
	}
	for i := range e.TrayPulse {
		e.TrayPulse[i] = 0
		e.TrayHeart[i] = false
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

	e.ensureTuningDefaults()
	e.ColorQueue = colorOrder
	e.QueueLen = colorCount
	e.QueuePos = 0
	e.AutoQueueLen = 0
	e.AutoQueueCooldown = 0
	e.wiggleRng = newPRNG(art.Seed ^ 0x51C3D7A1)
	e.lastWiggleIdx = -1
	e.lastRainbowWiggleIdx = -1
	for i := 0; i < NumColors; i++ {
		e.ColorGlowT[i] = 0
	}
	for i := 0; i < ActiveSlots; i++ {
		e.Active[i] = -1
	}
	e.updateSpecialStates(true)
	e.refillActiveColorsWithDelay(e.Tuning.LoadDelaySec)
	e.updateSpecialStates(true)
	e.syncBuffers()
}

// IsFinalColorMode returns true when strictly ONE hoop color remains to be stitched while playing.
// The win is effectively in hand: upbeat rush music plays, jiggles & gem highlights stop, flights speed up,
// and tapping any blocked/locked gem queues it silently to auto-resolve as soon as it becomes free!
func (e *Engine) IsFinalColorMode() bool {
	if e.Phase != PhasePlaying || e.HoopCount <= 0 {
		return false
	}
	remColors := 0
	for c := 0; c < NumColors; c++ {
		if e.Remain[c] > 0 {
			remColors++
			if remColors > 1 {
				return false
			}
		}
	}
	return remColors == 1
}

func (e *Engine) clearHighlightsAndJiggles() {
	for c := 0; c < NumColors; c++ {
		e.ColorGlowT[c] = 0
	}
	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i].JiggleT = 0
		e.Tiles[i].JiggleDelay = 0
	}
}

func (e *Engine) isTileQueued(idx int) bool {
	for i := 0; i < e.AutoQueueLen; i++ {
		if e.AutoQueue[i] == idx {
			return true
		}
	}
	return false
}

func (e *Engine) enqueueTile(idx int) {
	if e.isTileQueued(idx) || e.AutoQueueLen >= MaxGridTiles {
		return
	}
	e.AutoQueue[e.AutoQueueLen] = idx
	e.AutoQueueLen++
}

func (e *Engine) removeFromAutoQueue(idx int) {
	w := 0
	for i := 0; i < e.AutoQueueLen; i++ {
		if e.AutoQueue[i] != idx {
			e.AutoQueue[w] = e.AutoQueue[i]
			w++
		}
	}
	e.AutoQueueLen = w
}

func (e *Engine) hasReadyQueuedTile() bool {
	if e.Phase != PhasePlaying || e.AutoQueueLen == 0 {
		return false
	}
	for i := 0; i < e.AutoQueueLen; i++ {
		qIdx := e.AutoQueue[i]
		if qIdx < 0 || qIdx >= e.TileCount || !e.Tiles[qIdx].Alive {
			continue
		}
		if isTileLockedNow(e.Tiles[:e.TileCount], qIdx) {
			continue
		}
		if findFirstBlocker(e.Tiles[:e.TileCount], qIdx, e.GridCols, e.GridRows) < 0 {
			return true
		}
	}
	return false
}

// updateSpecialStates reveals any Hidden Pearl that is now stitchable (unblocked + active color)
// and unlocks any Locked Pearl whose 4 orthogonal adjacent tiles are now empty.
func (e *Engine) updateSpecialStates(silent bool) {
	finalMode := e.IsFinalColorMode()
	for i := 0; i < e.TileCount; i++ {
		t := &e.Tiles[i]
		if !t.Alive {
			continue
		}
		if t.Special == SpecialHidden && !t.Revealed {
			if e.isActiveColor(t.Color) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
				t.Revealed = true
				if !silent {
					if !finalMode {
						t.JiggleDelay = 0
						t.JiggleT = 0.90
					}
					e.HiddenRevealEvents++
				}
			}
		} else if t.Special == SpecialLocked && !t.Unlocked {
			if adjacentAliveDirMask(e.Tiles[:e.TileCount], i) == 0 {
				t.Unlocked = true
				if !silent {
					if !finalMode {
						t.JiggleDelay = 0
						t.JiggleT = 1.0
					}
					e.LockBreakEvents++
					e.addShake(0.30)
				}
			}
		}
	}
}

// pickRainbowTargetColor picks the best currently active stitch color for a Rainbow Wild Pearl.
func (e *Engine) pickRainbowTargetColor() int {
	best := -1
	bestRem := 0
	for i := 0; i < ActiveSlots; i++ {
		c := e.Active[i]
		if c >= 0 && e.Remain[c] > bestRem {
			best = c
			bestRem = e.Remain[c]
		}
	}
	return best
}

// awardHeartBonus grants early-placement bonus points (HeartBonusMax early down to HeartBonusMin late) and triggers the Heart Chime!
func (e *Engine) awardHeartBonus(wx, wz float32) {
	e.ensureTuningDefaults()
	remTotal := 0
	for c := 0; c < NumColors; c++ {
		remTotal += e.Remain[c]
	}
	denom := e.HoopCount
	if denom < 1 {
		denom = 1
	}
	ratio := float32(remTotal+1) / float32(denom)
	if ratio > 1.0 {
		ratio = 1.0
	}
	minB := e.Tuning.HeartBonusMin
	maxB := e.Tuning.HeartBonusMax
	if maxB < minB {
		maxB = minB
	}
	span := float64(maxB - minB)
	bonus := minB + uint32(math.Round(float64(ratio)*span))
	e.Score += bonus
	e.LastScoreDelta += bonus
	e.LastHeartBonus = bonus
	e.HeartClearEvents++
	e.LastEventWorldX = wx
	e.LastEventWorldZ = wz
	e.addShake(0.34)
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
	e.ensureTuningDefaults()
	scaled := amount * e.Tuning.ShakeIntensity
	if scaled > e.ShakeAmt {
		e.ShakeAmt = scaled
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

// triggerColorJiggle queues a calm, playful wiggle on ONLY visible alive board pearls of color c.
// Never wiggles concealed Hidden pearls (zero color spoiler!), Rainbow pearls, or during Final-Color Mode!
func (e *Engine) triggerColorJiggle(color uint8, delay float32) {
	if e.IsFinalColorMode() {
		return
	}
	for i := 0; i < e.TileCount; i++ {
		t := &e.Tiles[i]
		if !t.Alive || t.Special == SpecialRainbow || (t.Special == SpecialHidden && !t.Revealed) {
			continue
		}
		if t.Color == color {
			if delay > 0 {
				t.JiggleDelay = delay
				t.JiggleT = 0
			} else {
				t.JiggleDelay = 0
				t.JiggleT = 1.0
			}
		}
	}
}

// TriggerRandomActiveWiggle picks 1 random visible alive pearl matching ANY currently active stitch color OR an alive
// Heart Pearl (completely ignoring blocked/unblocked for 100% zero-spoiler fairness!) and gives it a gentle wiggle.
// Automatically suppressed once only 1 color remains (Final-Color Mode).
func (e *Engine) TriggerRandomActiveWiggle() int {
	if e.Phase != PhasePlaying || e.IsFinalColorMode() {
		return -1
	}
	var activeCands [MaxGridTiles]int
	nActive := 0
	var heartCands [MaxGridTiles]int
	nHeart := 0
	for i := 0; i < e.TileCount; i++ {
		t := e.Tiles[i]
		if !t.Alive || t.Special == SpecialRainbow || (t.Special == SpecialHidden && !t.Revealed) {
			continue
		}
		if e.isActiveColor(t.Color) {
			activeCands[nActive] = i
			nActive++
		}
		if t.IsHeart {
			heartCands[nHeart] = i
			nHeart++
		}
	}

	useHeart := nHeart > 0 && (nActive == 0 || e.wiggleRng.intn(100) < 42)
	var pool []int
	if useHeart {
		pool = heartCands[:nHeart]
	} else {
		pool = activeCands[:nActive]
	}
	n := len(pool)
	if n == 0 {
		return -1
	}
	pick := pool[e.wiggleRng.intn(n)]
	if n > 1 && pick == e.lastWiggleIdx {
		pick = pool[(e.wiggleRng.intn(n-1)+1)%n]
		if pick == e.lastWiggleIdx {
			for k := 0; k < n; k++ {
				if pool[k] != e.lastWiggleIdx {
					pick = pool[k]
					break
				}
			}
		}
	}
	e.lastWiggleIdx = pick
	e.Tiles[pick].JiggleDelay = 0
	e.Tiles[pick].JiggleT = 1.0
	e.syncBuffers()
	return pick
}

// TriggerRandomRainbowWiggle independently wiggles an alive Rainbow Wild Pearl on its own cadence!
// Automatically suppressed in Final-Color Mode.
func (e *Engine) TriggerRandomRainbowWiggle() int {
	if e.Phase != PhasePlaying || e.IsFinalColorMode() {
		return -1
	}
	var cands [MaxGridTiles]int
	n := 0
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive && e.Tiles[i].Special == SpecialRainbow {
			cands[n] = i
			n++
		}
	}
	if n == 0 {
		return -1
	}
	pick := cands[e.wiggleRng.intn(n)]
	if n > 1 && pick == e.lastRainbowWiggleIdx {
		pick = cands[(e.wiggleRng.intn(n-1)+1)%n]
	}
	e.lastRainbowWiggleIdx = pick
	e.Tiles[pick].JiggleDelay = 0
	e.Tiles[pick].JiggleT = 1.0
	e.syncBuffers()
	return pick
}

// refillActiveColors fills up to 2 active stitch slots during gameplay with the configured unlock delay.
func (e *Engine) refillActiveColors() {
	e.ensureTuningDefaults()
	e.refillActiveColorsWithDelay(e.Tuning.UnlockDelaySec)
}

// refillActiveColorsWithDelay fills up to 2 active stitch slots, EXCEPT the very last color in the queue
// is held back until the penultimate color is 100% completed (so the final two colors unlock separately!).
// Once only 1 color remains (Final-Color Mode), all highlights & jiggles are cleared immediately.
func (e *Engine) refillActiveColorsWithDelay(jiggleDelay float32) {
	activeAlive := 0
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] >= 0 && e.Remain[e.Active[i]] > 0 {
			activeAlive++
		} else {
			e.Active[i] = -1
		}
	}

	finalMode := e.IsFinalColorMode()
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
			if !finalMode {
				e.ColorGlowT[c] = 1.0
				e.triggerColorJiggle(uint8(c), jiggleDelay)
			}
			activeAlive++
			break
		}
	}

	if finalMode {
		e.clearHighlightsAndJiggles()
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

func (e *Engine) spawnFlight(color uint8, special uint8, sx, sy, sz, ex, ey, ez float32, delay float32, toHoop bool, targetIdx int) {
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
	dur := float32(0.30)
	if e.IsFinalColorMode() {
		dur = 0.16
		if toHoop {
			ctrlY = 1.15
		}
	}

	e.Flying[slot] = FlyingPearl{
		Active:      true,
		Color:       color,
		Special:     special,
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
		Duration:    dur,
		ToHoop:      toHoop,
		TargetIndex: targetIdx,
	}
}

func (e *Engine) captureUndoSnapshot() undoSnapshot {
	var aliveMask, revealedMask, unlockedMask uint64
	for i := 0; i < e.TileCount; i++ {
		bit := uint64(1) << uint(i)
		if e.Tiles[i].Alive {
			aliveMask |= bit
		}
		if e.Tiles[i].Revealed {
			revealedMask |= bit
		}
		if e.Tiles[i].Unlocked {
			unlockedMask |= bit
		}
	}
	var claimedMask uint64
	for i := 0; i < e.HoopCount; i++ {
		if e.HoopPearls[i].Claimed {
			claimedMask |= (uint64(1) << uint(i))
		}
	}
	return undoSnapshot{
		aliveMask:    aliveMask,
		claimedMask:  claimedMask,
		revealedMask: revealedMask,
		unlockedMask: unlockedMask,
		tray:         e.Tray,
		trayHeart:    e.TrayHeart,
		trayLen:      e.TrayLen,
		remain:       e.Remain,
		active:       e.Active,
		queuePos:     e.QueuePos,
		score:        e.Score,
		streak:       e.Streak,
		directCount:  e.DirectCount,
		trayUses:     e.TrayUses,
		layerDone:    e.LayerDone,
		phase:        e.Phase,
	}
}

func (e *Engine) drainTrayToHoop() {
	stagger := float32(0.07)
	staggerStep := float32(0.08)
	if e.IsFinalColorMode() {
		stagger = 0.03
		staggerStep = 0.04
	}
	for {
		progressed := false
		writeIdx := 0
		for i := 0; i < e.TrayLen; i++ {
			c := e.Tray[i]
			isH := e.TrayHeart[i]
			if e.isActiveColor(c) {
				hoopIdx := e.claimHoopSlot(c)
				if hoopIdx >= 0 {
					sx, sz := e.traySlotWorldPos(i)
					hp := &e.HoopPearls[hoopIdx]
					sp := SpecialNone
					if isH {
						sp = SpecialHeart
					}
					e.spawnFlight(c, sp, sx, 0.22, sz, hp.WorldX, 0.14, hp.WorldZ, stagger, true, hoopIdx)
					stagger += staggerStep
					e.Remain[c]--
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
					if isH {
						e.awardHeartBonus(hp.WorldX, hp.WorldZ)
					}
					if e.Remain[c] == 0 {
						e.triggerColorCleared(c)
					}
					e.checkLayerMilestones()
					progressed = true
					continue
				}
			}
			e.Tray[writeIdx] = c
			e.TrayHeart[writeIdx] = isH
			writeIdx++
		}
		for k := writeIdx; k < TrayCapacity; k++ {
			e.TrayHeart[k] = false
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
			e.AutoQueueLen = 0
			e.AutoQueueCooldown = 0
			e.CelebrateT = 1.0
			e.addShake(0.92)
			if e.TrayUses == 0 {
				e.Score += 1500
				e.LastScoreDelta += 1500
			}
			if e.UndoUsed == 0 && e.HintsUsed == 0 {
				e.Score += 750
				e.LastScoreDelta += 750
			}
			if e.UndoUsed == 0 && e.HintsUsed == 0 && e.TrayUses <= ThreeStarTrayLimit(e.HoopCount) {
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
			t := e.Tiles[i]
			if !t.Alive || isTileLockedNow(e.Tiles[:e.TileCount], i) {
				continue
			}
			if (t.Special == SpecialRainbow || e.isActiveColor(t.Color)) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
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

// TapTile attempts to untangle tile idx. Returns true if the tile was freed (or queued in Final-Color Mode).
func (e *Engine) TapTile(idx int) bool {
	if e.IntroActive || e.Phase == PhaseComplete || idx < 0 || idx >= e.TileCount || !e.Tiles[idx].Alive {
		return false
	}

	finalMode := e.IsFinalColorMode()

	// 1. Check Locked Pearl rule FIRST: cannot be used while ANY of the 4 orthogonal adjacent cells holds an alive pearl!
	if isTileLockedNow(e.Tiles[:e.TileCount], idx) {
		if finalMode {
			// In Final-Color Victory Rush Mode: zero error! Silently queue it to auto-resolve the moment it unlocks!
			e.enqueueTile(idx)
			e.QueueEvents++
			e.syncBuffers()
			return true
		}
		adj := findFirstAdjacentAlive(e.Tiles[:e.TileCount], idx)
		e.Tiles[idx].WobbleT = 1.0
		if adj >= 0 {
			e.Tiles[adj].WobbleT = 0.75
		}
		e.LastTappedBlockedIdx = idx
		e.LastBlockerIdx = adj
		e.BlockerFlashT = 1.0
		e.addShake(0.20)
		e.LockedTapEvents++
		e.syncBuffers()
		return false
	}

	// 2. Check directional arrow lane blocker
	blocker := findFirstBlocker(e.Tiles[:e.TileCount], idx, e.GridCols, e.GridRows)
	if blocker >= 0 {
		if finalMode {
			// In Final-Color Victory Rush Mode: zero error! Silently queue it to auto-resolve as soon as its lane opens!
			e.enqueueTile(idx)
			e.QueueEvents++
			e.syncBuffers()
			return true
		}
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

	isRainbow := e.Tiles[idx].Special == SpecialRainbow
	color := e.Tiles[idx].Color
	direct := false
	if isRainbow {
		rc := e.pickRainbowTargetColor()
		if rc >= 0 {
			color = uint8(rc)
			direct = true
		}
	} else {
		direct = e.isActiveColor(color)
	}

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
	e.removeFromAutoQueue(idx)
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

	isHeart := e.Tiles[idx].IsHeart
	specialKind := e.Tiles[idx].Special
	if specialKind == SpecialHidden {
		e.Tiles[idx].Revealed = true
	}
	e.Tiles[idx].Alive = false
	e.Tiles[idx].WobbleT = 0
	e.Tiles[idx].JiggleT = 0
	e.Tiles[idx].JiggleDelay = 0
	e.HintTileIdx = -1
	e.HintPulse = 0

	if direct {
		hoopIdx := e.claimHoopSlot(color)
		if hoopIdx >= 0 {
			hp := &e.HoopPearls[hoopIdx]
			e.spawnFlight(color, specialKind, sx, 0.24, sz, hp.WorldX, 0.14, hp.WorldZ, 0, true, hoopIdx)
			e.Remain[color]--
			e.DirectCount++
			e.Streak++
			if e.Streak > e.MaxStreak {
				e.MaxStreak = e.Streak
			}
			pts := uint32(100) * e.currentMultiplier()
			if isRainbow {
				pts += 250
				e.RainbowClearEvents++
			}
			e.Score += pts
			e.LastScoreDelta += pts
			e.LastEventWorldX = hp.WorldX
			e.LastEventWorldZ = hp.WorldZ
			e.StitchEvents++
			e.LastStitchCol = uint32(color)
			e.addShake(0.16 + float32(e.currentMultiplier())*0.025)

			if isHeart {
				e.awardHeartBonus(hp.WorldX, hp.WorldZ)
			}
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
		e.TrayHeart[slot] = isHeart
		e.TrayLen++
		e.TrayUses++
		e.Streak = 0
		e.TrayPulse[slot] = 1.0
		ex, ez := e.traySlotWorldPos(slot)
		e.LastEventWorldX = ex
		e.LastEventWorldZ = ez
		e.spawnFlight(color, specialKind, sx, 0.24, sz, ex, 0.20, ez, 0, false, slot)
		e.TrayEvents++
		e.drainTrayToHoop()
	}

	// Reveal newly stitchable Hidden pearls & break open newly freed Locked pearls!
	e.updateSpecialStates(false)
	if e.IsFinalColorMode() {
		e.clearHighlightsAndJiggles()
	}
	e.updatePhase()
	if e.AutoQueueLen > 0 && e.Phase == PhasePlaying && e.AutoQueueCooldown <= 0 {
		// Short 45ms beat before firing the next newly-freed queued gem in domino rhythm!
		e.AutoQueueCooldown = 0.045
	}
	e.syncBuffers()
	return true
}

// Undo cleanly reverts the previous move (limitless, deducts Tuning.UndoPenalty and resets active streak).
func (e *Engine) Undo() bool {
	if len(e.undoStack) == 0 {
		return false
	}
	e.ensureTuningDefaults()
	snap := e.undoStack[len(e.undoStack)-1]
	e.undoStack = e.undoStack[:len(e.undoStack)-1]

	for i := 0; i < e.TileCount; i++ {
		bit := uint64(1) << uint(i)
		e.Tiles[i].Alive = (snap.aliveMask & bit) != 0
		e.Tiles[i].Revealed = (snap.revealedMask & bit) != 0
		e.Tiles[i].Unlocked = (snap.unlockedMask & bit) != 0
		e.Tiles[i].WobbleT = 0
		e.Tiles[i].JiggleT = 0
		e.Tiles[i].JiggleDelay = 0
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
	e.TrayHeart = snap.trayHeart
	e.TrayLen = snap.trayLen
	e.Remain = snap.remain
	e.Active = snap.active
	e.QueuePos = snap.queuePos
	e.AutoQueueLen = 0
	e.AutoQueueCooldown = 0
	undoPen := e.Tuning.UndoPenalty
	if snap.score > undoPen {
		e.Score = snap.score - undoPen
	} else {
		e.Score = 0
	}
	e.Streak = 0
	e.DirectCount = snap.directCount
	e.TrayUses = snap.trayUses
	e.LayerDone = snap.layerDone
	e.Phase = snap.phase
	e.UndoUsed++
	e.LastPenaltyDelta = undoPen
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

// ComputeHint finds the mathematically optimal next tile on the best path to victory
// using iterative-deepening minimum-tray-cost search (NEVER sabotages the player with an unverified move!).
// Limitless in use: deducts Tuning.HintPenalty on each new highlighted hint.
// Returns HintNeedsUndo (-2) with ZERO penalty if the current board is in a dead-end pinch requiring Undo!
func (e *Engine) ComputeHint() int {
	if e.Phase == PhaseComplete {
		return -1
	}
	e.ensureTuningDefaults()
	hintPen := e.Tuning.HintPenalty

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
		trayUses:  e.TrayUses,
		remain:    e.Remain,
		active:    e.Active,
		queue:     e.ColorQueue,
		queueLen:  e.QueueLen,
		queuePos:  e.QueuePos,
	}

	ok, bestMove, _ := solveOptimalHint(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st)

	if ok && bestMove >= 0 {
		if bestMove != e.HintTileIdx {
			if e.Score > hintPen {
				e.Score -= hintPen
			} else {
				e.Score = 0
			}
			e.HintsUsed++
			e.LastPenaltyDelta = hintPen
		} else {
			e.LastPenaltyDelta = 0
		}
		e.HintTileIdx = bestMove
		e.HintPulse = 1.0
		e.HintEvents++
		e.syncBuffers()
		return bestMove
	}

	// No verified winning path exists from this board state -> cleanly guide the player to Undo!
	e.HintTileIdx = HintNeedsUndo
	e.HintPulse = 1.0
	e.LastPenaltyDelta = 0
	e.HintEvents++
	e.syncBuffers()
	return HintNeedsUndo
}

// IsAnimating reports whether any pearl flight, wobble, bloom, shockwave, shake, intro unravel, or queued cascade needs 60 FPS.
func (e *Engine) IsAnimating() bool {
	if e.IntroActive || e.CelebrateT > 0.005 || e.HintTileIdx >= 0 || e.ShakeAmt > 0.005 ||
		e.ColorBurstPulse > 0.005 || e.LayerBurstPulse > 0.005 || e.BlockerFlashT > 0.005 ||
		e.hasReadyQueuedTile() {
		return true
	}
	for i := range e.Flying {
		if e.Flying[i].Active {
			return true
		}
	}
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].WobbleT > 0.005 || e.Tiles[i].JiggleT > 0.005 || e.Tiles[i].JiggleDelay > 0.005 {
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

func (e *Engine) spawnIntroUnravelFlight(hoopIdx, tileIdx int) bool {
	if hoopIdx < 0 || hoopIdx >= e.HoopCount || tileIdx < 0 || tileIdx >= e.TileCount {
		return false
	}
	slot := -1
	for i := range e.Flying {
		if !e.Flying[i].Active {
			slot = i
			break
		}
	}
	if slot < 0 {
		return false
	}
	hp := e.HoopPearls[hoopIdx]
	tx, tz := e.tileWorldPos(e.Tiles[tileIdx].Col, e.Tiles[tileIdx].Row)
	midX := (hp.WorldX + tx) * 0.5
	midZ := (hp.WorldZ + tz) * 0.5
	e.Flying[slot] = FlyingPearl{
		Active:      true,
		Color:       hp.Color,
		Special:     0,
		StartX:      hp.WorldX,
		StartY:      0.20,
		StartZ:      hp.WorldZ,
		CtrlX:       midX * 1.15,
		CtrlY:       1.28,
		CtrlZ:       midZ,
		EndX:        tx,
		EndY:        0.22,
		EndZ:        tz,
		Progress:    0,
		Delay:       0,
		Duration:    0.32,
		ToHoop:      false,
		ToTile:      true,
		TargetIndex: tileIdx,
	}
	return true
}

func (e *Engine) stepIntroUnravel(dt float32) {
	if !e.IntroActive {
		return
	}
	e.IntroElapsed += dt

	allLaunched := true
	for h := 0; h < e.HoopCount; h++ {
		bit := uint64(1) << uint(h)
		if (e.IntroLaunchedMask & bit) != 0 {
			continue
		}
		if e.IntroElapsed >= e.IntroLaunchTime[h] {
			ti := e.IntroTileForHoop[h]
			if e.spawnIntroUnravelFlight(h, ti) {
				e.HoopPearls[h].Stitched = false
				e.HoopPearls[h].BloomT = 0
				e.HoopPearls[h].ShimmerPulse = 0.85
				e.IntroLaunchedMask |= bit
			} else {
				allLaunched = false
			}
		} else {
			allLaunched = false
		}
	}

	if allLaunched && e.IntroHiddenMask == 0 {
		e.IntroActive = false
		for slot := 0; slot < ActiveSlots; slot++ {
			c := e.Active[slot]
			if c >= 0 && c < NumColors && e.Remain[c] > 0 {
				e.ColorGlowT[c] = 1.0
				e.triggerColorJiggle(uint8(c), 0.35)
			}
		}
	}
}

// processAutoQueue automatically resolves queued Final-Color gems the instant their lane/locks clear!
func (e *Engine) processAutoQueue(dt float32) {
	if e.AutoQueueLen == 0 || e.Phase != PhasePlaying {
		return
	}
	if e.AutoQueueCooldown > 0 {
		e.AutoQueueCooldown -= dt
		if e.AutoQueueCooldown > 0 {
			return
		}
		e.AutoQueueCooldown = 0
	}

	// Compact dead entries and fire the earliest newly playable queued tile in crisp domino order!
	w := 0
	firedIdx := -1
	for i := 0; i < e.AutoQueueLen; i++ {
		qIdx := e.AutoQueue[i]
		if qIdx < 0 || qIdx >= e.TileCount || !e.Tiles[qIdx].Alive {
			continue
		}
		if firedIdx < 0 && !isTileLockedNow(e.Tiles[:e.TileCount], qIdx) &&
			findFirstBlocker(e.Tiles[:e.TileCount], qIdx, e.GridCols, e.GridRows) < 0 {
			firedIdx = qIdx
			continue
		}
		e.AutoQueue[w] = qIdx
		w++
	}
	e.AutoQueueLen = w

	if firedIdx >= 0 {
		e.TapTile(firedIdx)
		if e.AutoQueueLen > 0 && e.Phase == PhasePlaying {
			e.AutoQueueCooldown = 0.055
		}
	}
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

	// Drive first-load 3D Unravel Intro animation if active
	if e.IntroActive {
		e.stepIntroUnravel(dt)
	}

	// Auto-resolve queued Final-Color gems as soon as their blockers/locks vanish!
	e.processAutoQueue(dt)

	finalMode := e.IsFinalColorMode()
	if finalMode {
		e.clearHighlightsAndJiggles()
	}

	// Smooth decay on juice pulses, screenshake & temporary 3.5s double-beat interior unlock glow
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > 0 {
			e.ColorGlowT[c] -= dt * 0.285
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
		if e.Tiles[i].JiggleDelay > 0 {
			e.Tiles[i].JiggleDelay -= dt
			if e.Tiles[i].JiggleDelay <= 0 {
				e.Tiles[i].JiggleDelay = 0
				e.Tiles[i].JiggleT = 1.0
			}
		} else if e.Tiles[i].JiggleT > 0 {
			e.Tiles[i].JiggleT -= dt * 1.85
			if e.Tiles[i].JiggleT < 0 {
				e.Tiles[i].JiggleT = 0
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
			if f.ToTile && f.TargetIndex >= 0 && f.TargetIndex < e.TileCount {
				e.IntroHiddenMask &^= (uint64(1) << uint(f.TargetIndex))
				e.Tiles[f.TargetIndex].JiggleT = 0.65
				f.ToTile = false
			} else if f.ToHoop && f.TargetIndex >= 0 && f.TargetIndex < e.HoopCount {
				e.HoopPearls[f.TargetIndex].Stitched = true
				e.HoopPearls[f.TargetIndex].BloomT = 0.25
				e.HoopPearls[f.TargetIndex].ShimmerPulse = 1.0
			}
		}
	}

	// Re-check intro completion immediately if final landing cleared IntroHiddenMask this tick
	if e.IntroActive && e.IntroHiddenMask == 0 {
		allLaunched := true
		for h := 0; h < e.HoopCount; h++ {
			if (e.IntroLaunchedMask & (uint64(1) << uint(h))) == 0 {
				allLaunched = false
				break
			}
		}
		if allLaunched {
			e.IntroActive = false
			for slot := 0; slot < ActiveSlots; slot++ {
				c := e.Active[slot]
				if c >= 0 && c < NumColors && e.Remain[c] > 0 {
					e.ColorGlowT[c] = 1.0
					e.triggerColorJiggle(uint8(c), 0.35)
				}
			}
		}
	}

	bloomRate := float32(4.8)
	shimmerRate := float32(1.65)
	if finalMode {
		bloomRate = 9.5
		shimmerRate = 3.2
	}
	for i := 0; i < e.HoopCount; i++ {
		hp := &e.HoopPearls[i]
		if hp.Stitched && hp.BloomT < 1.0 {
			hp.BloomT += dt * bloomRate
			if hp.BloomT > 1.0 {
				hp.BloomT = 1.0
			}
		}
		if hp.ShimmerPulse > 0 {
			hp.ShimmerPulse -= dt * shimmerRate
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
	e.ensureTuningDefaults()
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

	// 2: sunDir + sunIntensity (scaled live by config.json lighting.topLightIntensity)
	e.Scene[8] = solar.SunDirX
	e.Scene[9] = solar.SunDirY
	e.Scene[10] = solar.SunDirZ
	e.Scene[11] = solar.SunIntensity * e.Tuning.TopLight

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

	// 15: reserved (multiplier, nextQueuedColor, levelIndex, spotlightMaxGlowT)
	maxGlow := float32(0)
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > maxGlow {
			maxGlow = e.ColorGlowT[c]
		}
	}
	e.Scene[60] = float32(e.currentMultiplier())
	e.Scene[61] = float32(e.nextQueuedColor())
	e.Scene[62] = float32(e.LevelIndex)
	e.Scene[63] = maxGlow

	// --- Palette (6 vec4s) ---
	for c := 0; c < NumColors; c++ {
		base := SceneHeaderFloats + c*4
		e.Scene[base+0] = palTable[c][0]
		e.Scene[base+1] = palTable[c][1]
		e.Scene[base+2] = palTable[c][2]
		e.Scene[base+3] = palTable[c][3]
	}

	// --- Board Tiles (64 * 8 floats) & TileTelemetry ---
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
		adjMask := uint32(0)
		lockedNow := false
		if t.Alive && t.Special == SpecialLocked && !t.Unlocked {
			adjMask = adjacentAliveDirMask(e.Tiles[:e.TileCount], i)
			lockedNow = adjMask != 0
		}
		hiddenConcealed := t.Alive && t.Special == SpecialHidden && !t.Revealed
		playable := unblocked && !lockedNow

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

		// IMPORTANT: Zero-spoiler flags! (Bit 2 is NEVER set!)
		// Bit 1 (1) = alive
		// Bit 4 (4) = hinted
		// Bit 8 (8) = blocker flash
		// Bit 16 (16) = player-queued auto-resolve gem (Final-Color Mode only)
		// Bit 32 (32) = 3D Heart-Shaped Pearl
		// Bit 64 (64) = Rainbow Wild Pearl
		// Bit 128 (128) = Hidden Pearl (currently concealed black)
		// Bit 256 (256) = Locked Pearl (currently locked by adjacent pearls)
		// Bits 1024/2048/4096/8192 = N/E/S/W orthogonal neighbor lock bars!
		introHidden := e.IntroActive && (e.IntroHiddenMask&(uint64(1)<<uint(i))) != 0
		flags := uint32(0)
		if t.Alive && !introHidden {
			flags |= 1
		}
		if i == e.HintTileIdx {
			flags |= 4
		}
		if e.BlockerFlashT > 0.01 && (i == e.LastBlockerIdx || i == e.LastTappedBlockedIdx) {
			flags |= 8
		}
		if t.Alive && e.isTileQueued(i) {
			flags |= 16
		}
		if t.IsHeart || t.Special == SpecialHeart {
			flags |= 32
		}
		if t.Special == SpecialRainbow {
			flags |= 64
		}
		if hiddenConcealed {
			flags |= 128
		}
		if lockedNow {
			flags |= 256 | (adjMask << 10)
		}

		// Suppress interior active-color glow on concealed Hidden pearls, Rainbow pearls, AND Final-Color Mode!
		finalModeNow := e.IsFinalColorMode()
		glowVal := e.ColorGlowT[t.Color] * e.Tuning.GlowIntensity
		if hiddenConcealed || t.Special == SpecialRainbow || finalModeNow || e.IntroActive {
			glowVal = 0
		}

		e.Scene[sBase+0] = wx + ox
		e.Scene[sBase+1] = 0.22 + t.JiggleT*0.10*e.Tuning.JiggleIntensity
		e.Scene[sBase+2] = wz + oz
		e.Scene[sBase+3] = pearlRad
		e.Scene[sBase+4] = float32(t.Color)
		e.Scene[sBase+5] = float32(t.Dir)
		e.Scene[sBase+6] = float32(flags)
		e.Scene[sBase+7] = glowVal

		e.TileTelemetry[tBase+0] = float32(t.Col)
		e.TileTelemetry[tBase+1] = float32(t.Row)
		e.TileTelemetry[tBase+2] = float32(t.Color)
		e.TileTelemetry[tBase+3] = float32(t.Dir)
		if t.Alive {
			switch t.Special {
			case SpecialHeart:
				e.TileTelemetry[tBase+4] = 2
			case SpecialRainbow:
				e.TileTelemetry[tBase+4] = 3
			case SpecialHidden:
				if t.Revealed {
					e.TileTelemetry[tBase+4] = 5
				} else {
					e.TileTelemetry[tBase+4] = 4
				}
			case SpecialLocked:
				if lockedNow {
					e.TileTelemetry[tBase+4] = 6
				} else {
					e.TileTelemetry[tBase+4] = 7
				}
			default:
				if t.IsHeart {
					e.TileTelemetry[tBase+4] = 2
				} else {
					e.TileTelemetry[tBase+4] = 1
				}
			}
		} else {
			e.TileTelemetry[tBase+4] = 0
		}
		if playable {
			e.TileTelemetry[tBase+5] = 1
		} else {
			e.TileTelemetry[tBase+5] = 0
		}
		e.TileTelemetry[tBase+6] = wx
		e.TileTelemetry[tBase+7] = wz
	}

	// --- Embroidery Hoop Pearls (64 * 8 floats) ---
	stitchedCount := 0
	hoopPearlR := float32(0.125)
	if e.HoopCount > 50 {
		hoopPearlR = 0.090
	} else if e.HoopCount > 34 {
		hoopPearlR = 0.102
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
		if !hp.Claimed && !e.IntroActive && e.isActiveColor(hp.Color) {
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
			if e.Flying[fi].Active && !e.Flying[fi].ToHoop && !e.Flying[fi].ToTile && e.Flying[fi].TargetIndex == i {
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
		e.Scene[base+7] = float32(f.Special)
	}

	// --- Compact Telemetry State Buffer (68 floats) ---
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
	e.State[52] = float32(e.LastSeed & 0xFFFF)
	e.State[53] = float32(e.LastSeed >> 16)
	e.State[54] = float32(e.HeartClearEvents)
	e.State[55] = float32(e.LastHeartBonus)
	e.State[56] = float32(e.RainbowClearEvents)
	e.State[57] = float32(e.HiddenRevealEvents)
	e.State[58] = float32(e.LockBreakEvents)
	e.State[59] = float32(e.LockedTapEvents)
	e.State[60] = float32(e.SeedDifficulty)
	if e.IsFinalColorMode() {
		e.State[61] = 1
	} else {
		e.State[61] = 0
	}
	e.State[62] = float32(e.AutoQueueLen)
	e.State[63] = float32(e.QueueEvents)
	if e.IntroActive {
		e.State[64] = 1
		if e.IntroDuration > 0.01 {
			p := e.IntroElapsed / e.IntroDuration
			if p > 1 {
				p = 1
			}
			e.State[65] = p
		} else {
			e.State[65] = 0
		}
	} else {
		e.State[64] = 0
		e.State[65] = 1
	}
	e.State[66] = float32(e.CustomSpecialMask)
	e.State[67] = 0
}
