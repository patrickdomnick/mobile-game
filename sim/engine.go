package sim

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
	CustomColorCount  int
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
// [id, chapter, theme, cols, rows, difficulty, seedLo, seedHi, flags(bit0=noBlockers), maxHearts, maxRainbows, maxHidden, maxLocked, boardShape, ...stitches(x,z,color,layer)].
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
	boardShape := uint8(int(e.CustomLevelBuf[13]) & 0xFF)

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
		BoardShape:  boardShape,
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
	if colorCount < 3 {
		colorCount = 3
	}
	if colorCount > NumColors {
		colorCount = NumColors
	}
	e.CustomColorCount = colorCount
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

	// Calm, unhurried welcome reveal: ~2.2s logo & finished embroidery hold, then graceful 0.19s pearl lift-offs
	const holdSec = float32(2.20)
	const stepSec = float32(0.19)
	const flightSec = float32(0.55)
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

