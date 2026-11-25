package sim

import "math"

const (
	ColorRuby      = 0
	ColorCobalt    = 1
	ColorEmerald   = 2
	ColorGold      = 3
	ColorAmethyst  = 4
	ColorTurquoise = 5
	NumColors      = 6

	ThemeJewelAtelier = 0
	ThemeCyberNeon    = 1
	ThemePopArt       = 2
	ThemeStainedGlass = 3
	NumThemes         = 4

	NumChapters      = 4
	LevelsPerChapter = 13
)

// ThemePalettes defines 4 vibrant, unmistakable high-pop 6-color themes with maximum hue separation.
// 4th channel encodes iridescence / emissive luster.
var ThemePalettes = [NumThemes][NumColors][4]float32{
	// 0: Jewel Atelier (Rich, sharply separated gemstones on deep sunlit slate-walnut)
	{
		{0.96, 0.08, 0.16, 0.50}, // 0: Scarlet Ruby (unmistakably RED, zero pink overlap with Amethyst)
		{0.08, 0.36, 0.98, 0.56}, // 1: Royal Cobalt (deep royal blue)
		{0.04, 0.80, 0.32, 0.50}, // 2: Emerald Jade (pure lush green)
		{1.00, 0.78, 0.04, 0.56}, // 3: Sunbeam Gold (radiant yellow-gold)
		{0.62, 0.16, 0.98, 0.60}, // 4: Vivid Amethyst (crisp royal purple)
		{0.02, 0.86, 0.94, 0.55}, // 5: Aqua Cyan (bright sky-aqua)
	},
	// 1: Cyber Arcade (Crisp electric synthwave spectrum)
	{
		{1.00, 0.08, 0.56, 0.95}, // 0: Hot Magenta
		{0.02, 0.92, 1.00, 0.95}, // 1: Electric Cyan
		{0.44, 1.00, 0.08, 0.92}, // 2: Acid Lime
		{1.00, 0.64, 0.02, 0.92}, // 3: Laser Amber (distinct warm amber-gold)
		{0.58, 0.18, 1.00, 0.95}, // 4: Ultraviolet
		{1.00, 0.18, 0.10, 0.92}, // 5: Flame Red (distinct neon red-orange)
	},
	// 2: Pop Studio (Bold Warhol / Lichtenstein primaries)
	{
		{0.98, 0.10, 0.12, 0.30}, // 0: Pop Red
		{0.08, 0.34, 0.98, 0.30}, // 1: Royal Blue
		{0.04, 0.82, 0.40, 0.30}, // 2: Pop Green
		{1.00, 0.86, 0.02, 0.30}, // 3: Comic Yellow
		{0.96, 0.14, 0.74, 0.30}, // 4: Hot Magenta
		{1.00, 0.44, 0.02, 0.30}, // 5: Vivid Orange
	},
	// 3: Cathedral Glass (Crisp jewel stained-glass prisms)
	{
		{0.96, 0.08, 0.22, 0.82}, // 0: Crimson Rose
		{0.10, 0.46, 0.98, 0.85}, // 1: Cathedral Sapphire
		{0.04, 0.84, 0.44, 0.82}, // 2: Viridian Emerald
		{1.00, 0.76, 0.04, 0.84}, // 3: Sun Gold
		{0.64, 0.18, 0.98, 0.86}, // 4: Royal Violet
		{0.94, 0.97, 1.00, 0.90}, // 5: Pearl White
	},
}

// StitchPoint is one pearl placement inside the normalized embroidery hoop (radius <= 0.86),
// tagged with Layer (0=Core, 1=Mid, 2=Outer) for ring celebrations.
type StitchPoint struct {
	X     float32
	Z     float32
	Color uint8
	Layer uint8
}

// ArtworkDef defines a theme-matched, multi-layer embroidery pattern and paired untangle board.
type ArtworkDef struct {
	ID          int
	Chapter     int // 0..3 (4 independent Day-1 Campaigns)
	Theme       int // Visual theme natively bound to this campaign
	Name        string
	Cols        int
	Rows        int
	Difficulty  int // 0 = zero-blocker warm-up, 1..11 = strictly escalating difficulty
	Seed        uint32
	NoBlockers  bool // When true, every starting tile has an unobstructed outward lane
	MaxHearts   int  // 0..3 sculpted 3D Heart Pearls
	MaxRainbows int  // 0..2 extra Rainbow Wild Pearls on board
	MaxHidden   int  // 0..4 Hidden (obsidian-black) Pearls
	MaxLocked   int  // 0..3 Locked (clear-4-neighbors) Pearls
	Stitches    []StitchPoint
}

func waveRingPoints(count int, baseR, waveAmp float64, waveFreq int, offsetRad float64, colors []uint8, layer uint8) []StitchPoint {
	pts := make([]StitchPoint, 0, count)
	for i := 0; i < count; i++ {
		ang := offsetRad + float64(i)*(2.0*math.Pi/float64(count))
		r := baseR + waveAmp*math.Cos(float64(waveFreq)*(ang-offsetRad))
		if r > 0.85 {
			r = 0.85
		}
		if r < 0.14 {
			r = 0.14
		}
		pts = append(pts, StitchPoint{
			X:     float32(math.Cos(ang) * r),
			Z:     float32(math.Sin(ang) * r),
			Color: colors[i%len(colors)],
			Layer: layer,
		})
	}
	return pts
}

func buildHeartStitches(cCore, cAccent, cMain, cTrim uint8) []StitchPoint {
	return []StitchPoint{
		{0.00, -0.14, cCore, 0}, {0.00, 0.14, cCore, 0},
		{-0.22, -0.02, cAccent, 0}, {0.22, -0.02, cAccent, 0},
		{-0.28, -0.34, cMain, 1}, {0.28, -0.34, cMain, 1},
		{-0.46, -0.08, cMain, 1}, {0.46, -0.08, cMain, 1},
		{-0.30, 0.24, cTrim, 1}, {0.30, 0.24, cTrim, 1},
		{0.00, 0.44, cMain, 1},
		{-0.44, -0.58, cMain, 2}, {0.44, -0.58, cMain, 2},
		{0.00, -0.42, cCore, 2},
		{-0.72, -0.26, cTrim, 2}, {0.72, -0.26, cTrim, 2},
		{-0.68, 0.14, cAccent, 2}, {0.68, 0.14, cAccent, 2},
		{-0.42, 0.50, cCore, 2}, {0.42, 0.50, cCore, 2},
		{0.00, 0.74, cMain, 2},
	}
}

func buildSpiralStitches(count int, turns float64, colors []uint8) []StitchPoint {
	pts := make([]StitchPoint, 0, count)
	for i := 0; i < count; i++ {
		t := float64(i) / float64(count-1)
		ang := -math.Pi/2 + t*turns*2.0*math.Pi
		rad := 0.10 + t*0.74
		layer := uint8(0)
		if i >= (count*2)/3 {
			layer = 2
		} else if i >= count/3 {
			layer = 1
		}
		pts = append(pts, StitchPoint{
			X:     float32(math.Cos(ang) * rad),
			Z:     float32(math.Sin(ang) * rad),
			Color: colors[i%len(colors)],
			Layer: layer,
		})
	}
	return pts
}

type ringSpec struct {
	count   int
	radius  float64
	waveAmp float64
	freq    int
	offset  float64
	layer   uint8
	cA      int // index into motif palette
	cB      int
}

func buildMultiRingMotif(centerColor uint8, hasCenter bool, pal []uint8, rings []ringSpec) []StitchPoint {
	total := 0
	if hasCenter {
		total++
	}
	for _, r := range rings {
		total += r.count
	}
	pts := make([]StitchPoint, 0, total)
	if hasCenter {
		pts = append(pts, StitchPoint{X: 0, Z: 0, Color: centerColor, Layer: 0})
	}
	for _, r := range rings {
		cols := []uint8{pal[r.cA%len(pal)], pal[r.cB%len(pal)]}
		pts = append(pts, waveRingPoints(r.count, r.radius, r.waveAmp, r.freq, r.offset, cols, r.layer)...)
	}
	return pts
}

// buildCampaignPattern builds a clean, zero-overlap, theme-tailored hoop pattern for tier 0..12
// with exact pearl count and color count matching the 13-level campaign ladder!
func buildCampaignPattern(campaignIdx, tierIdx int, pal []uint8) []StitchPoint {
	// Per-campaign signature geometry twists so every world feels unmistakable!
	baseOffset := -math.Pi / 2
	petalAmp := 0.045
	freqShift := 0
	switch campaignIdx {
	case 0: // Jewel Atelier: floral petals & artisan brooches
		baseOffset = -math.Pi / 2
		petalAmp = 0.055
		freqShift = 0
	case 1: // Cyber Arcade: sharp 4-fold & 8-fold neon grids / prisms
		baseOffset = math.Pi / 4
		petalAmp = 0.065
		freqShift = 1
	case 2: // Pop Studio: bold comic starbursts & graphic rays
		baseOffset = -math.Pi/2 + math.Pi/10
		petalAmp = 0.075
		freqShift = 2
	case 3: // Cathedral Glass: gothic arches & symmetrical rose windows
		baseOffset = -math.Pi / 2
		petalAmp = 0.035
		freqShift = 0
	}

	switch tierIdx {
	case 0: // L1 (5x5, 14 pearls, 3 colors, ZERO blockers)
		return buildMultiRingMotif(pal[0], true, pal[:3], []ringSpec{
			{count: 5, radius: 0.34, waveAmp: 0, freq: 5, offset: baseOffset, layer: 1, cA: 1, cB: 0},
			{count: 8, radius: 0.72, waveAmp: petalAmp, freq: 4, offset: baseOffset + math.Pi/8, layer: 2, cA: 2, cB: 1},
		})
	case 1: // L2 (5x5, 16 pearls, 4 colors, ZERO blockers)
		return buildMultiRingMotif(pal[0], false, pal[:4], []ringSpec{
			{count: 4, radius: 0.24, waveAmp: 0, freq: 4, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 4, radius: 0.48, waveAmp: 0, freq: 4, offset: baseOffset + math.Pi/4, layer: 1, cA: 2, cB: 1},
			{count: 8, radius: 0.76, waveAmp: petalAmp, freq: 4, offset: baseOffset, layer: 2, cA: 3, cB: 2},
		})
	case 2: // L3 (5x5, 21 pearls, 4 colors, Diff 1)
		if campaignIdx == 0 {
			return buildHeartStitches(pal[0], pal[1], pal[2], pal[3])
		}
		return buildMultiRingMotif(pal[0], true, pal[:4], []ringSpec{
			{count: 6, radius: 0.30, waveAmp: 0, freq: 6, offset: baseOffset, layer: 0, cA: 1, cB: 0},
			{count: 6, radius: 0.55, waveAmp: petalAmp * 0.7, freq: 3 + freqShift, offset: baseOffset + math.Pi/6, layer: 1, cA: 2, cB: 3},
			{count: 8, radius: 0.79, waveAmp: petalAmp, freq: 4, offset: baseOffset, layer: 2, cA: 3, cB: 1},
		})
	case 3: // L4 (6x5, 26 pearls, 4 colors, Diff 2)
		return buildMultiRingMotif(pal[0], true, pal[:4], []ringSpec{
			{count: 5, radius: 0.25, waveAmp: 0, freq: 5, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 8, radius: 0.52, waveAmp: petalAmp * 0.8, freq: 4, offset: baseOffset + math.Pi/8, layer: 1, cA: 2, cB: 1},
			{count: 12, radius: 0.79, waveAmp: petalAmp, freq: 6, offset: baseOffset, layer: 2, cA: 3, cB: 2},
		})
	case 4: // L5 (6x6, 32 pearls, 5 colors, Diff 3)
		return buildMultiRingMotif(pal[0], true, pal[:5], []ringSpec{
			{count: 6, radius: 0.25, waveAmp: 0, freq: 6, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 10, radius: 0.52, waveAmp: petalAmp * 0.8, freq: 5, offset: baseOffset + math.Pi/10, layer: 1, cA: 2, cB: 3},
			{count: 15, radius: 0.79, waveAmp: petalAmp, freq: 5, offset: baseOffset, layer: 2, cA: 4, cB: 2},
		})
	case 5: // L6 (7x6, 37 pearls, 5 colors, Diff 4)
		if campaignIdx == 1 || campaignIdx == 3 {
			return buildSpiralStitches(37, 2.35, pal[:5])
		}
		return buildMultiRingMotif(pal[0], true, pal[:5], []ringSpec{
			{count: 6, radius: 0.24, waveAmp: 0, freq: 6, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 12, radius: 0.51, waveAmp: petalAmp * 0.7, freq: 6, offset: baseOffset + math.Pi/12, layer: 1, cA: 2, cB: 3},
			{count: 18, radius: 0.80, waveAmp: petalAmp, freq: 6, offset: baseOffset, layer: 2, cA: 4, cB: 1},
		})
	case 6: // L7 (7x7, 43 pearls, 5 colors, Diff 5)
		return buildMultiRingMotif(pal[0], true, pal[:5], []ringSpec{
			{count: 7, radius: 0.25, waveAmp: 0, freq: 7, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 14, radius: 0.52, waveAmp: petalAmp * 0.7, freq: 7, offset: baseOffset + math.Pi/14, layer: 1, cA: 2, cB: 3},
			{count: 21, radius: 0.80, waveAmp: petalAmp * 0.85, freq: 7, offset: baseOffset, layer: 2, cA: 4, cB: 2},
		})
	case 7: // L8 (8x6, 45 pearls, 6 colors, Diff 6)
		return buildMultiRingMotif(pal[0], true, pal[:6], []ringSpec{
			{count: 6, radius: 0.21, waveAmp: 0, freq: 6, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 10, radius: 0.42, waveAmp: 0.02, freq: 5, offset: baseOffset + math.Pi/10, layer: 1, cA: 2, cB: 3},
			{count: 13, radius: 0.63, waveAmp: 0.025, freq: 6 + freqShift, offset: baseOffset, layer: 1, cA: 4, cB: 1},
			{count: 15, radius: 0.82, waveAmp: petalAmp * 0.7, freq: 5, offset: baseOffset + math.Pi/15, layer: 2, cA: 5, cB: 3},
		})
	case 8: // L9 (8x7, 51 pearls, 6 colors, Diff 7)
		return buildMultiRingMotif(pal[0], true, pal[:6], []ringSpec{
			{count: 6, radius: 0.21, waveAmp: 0, freq: 6, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 11, radius: 0.41, waveAmp: 0.02, freq: 4, offset: baseOffset, layer: 1, cA: 2, cB: 3},
			{count: 15, radius: 0.62, waveAmp: 0.025, freq: 5, offset: baseOffset + math.Pi/15, layer: 1, cA: 4, cB: 5},
			{count: 18, radius: 0.83, waveAmp: petalAmp * 0.6, freq: 6, offset: baseOffset, layer: 2, cA: 5, cB: 2},
		})
	case 9: // L10 (8x8 Standard, 54 pearls, 6 colors, Diff 8)
		return buildMultiRingMotif(pal[0], true, pal[:6], []ringSpec{
			{count: 6, radius: 0.21, waveAmp: 0, freq: 6, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 11, radius: 0.41, waveAmp: 0.02, freq: 6, offset: baseOffset + math.Pi/11, layer: 1, cA: 2, cB: 3},
			{count: 16, radius: 0.62, waveAmp: 0.025, freq: 8, offset: baseOffset, layer: 1, cA: 4, cB: 1},
			{count: 20, radius: 0.83, waveAmp: petalAmp * 0.55, freq: 4 + freqShift, offset: baseOffset + math.Pi/20, layer: 2, cA: 5, cB: 3},
		})
	case 10: // L11 (8x8 Hard, 58 pearls, 6 colors, Diff 9)
		return buildMultiRingMotif(pal[0], true, pal[:6], []ringSpec{
			{count: 7, radius: 0.22, waveAmp: 0, freq: 7, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 12, radius: 0.42, waveAmp: 0.02, freq: 6, offset: baseOffset + math.Pi/12, layer: 1, cA: 2, cB: 3},
			{count: 17, radius: 0.63, waveAmp: 0.02, freq: 6, offset: baseOffset, layer: 1, cA: 4, cB: 5},
			{count: 21, radius: 0.83, waveAmp: petalAmp * 0.5, freq: 7, offset: baseOffset + math.Pi/21, layer: 2, cA: 5, cB: 0},
		})
	case 11: // L12 (8x8 Expert, 61 pearls, 6 colors, Diff 10)
		return buildMultiRingMotif(pal[0], true, pal[:6], []ringSpec{
			{count: 7, radius: 0.22, waveAmp: 0, freq: 7, offset: baseOffset, layer: 0, cA: 0, cB: 2},
			{count: 13, radius: 0.42, waveAmp: 0.02, freq: 5, offset: baseOffset, layer: 1, cA: 1, cB: 3},
			{count: 18, radius: 0.63, waveAmp: 0.02, freq: 6, offset: baseOffset + math.Pi/18, layer: 1, cA: 4, cB: 5},
			{count: 22, radius: 0.83, waveAmp: petalAmp * 0.45, freq: 6 + freqShift, offset: baseOffset, layer: 2, cA: 3, cB: 5},
		})
	default: // L13 (8x8 Grand Masterpiece, 62 hoop stitches + 2 Rainbows = 64 board tiles, Diff 11)
		return buildMultiRingMotif(pal[0], true, pal[:6], []ringSpec{
			{count: 7, radius: 0.22, waveAmp: 0, freq: 7, offset: baseOffset, layer: 0, cA: 0, cB: 1},
			{count: 13, radius: 0.42, waveAmp: 0.018, freq: 7, offset: baseOffset + math.Pi/13, layer: 1, cA: 2, cB: 3},
			{count: 19, radius: 0.63, waveAmp: 0.018, freq: 6, offset: baseOffset, layer: 1, cA: 4, cB: 5},
			{count: 22, radius: 0.84, waveAmp: petalAmp * 0.35, freq: 8, offset: baseOffset + math.Pi/22, layer: 2, cA: 5, cB: 1},
		})
	}
}

type tierTemplate struct {
	cols        int
	rows        int
	difficulty  int
	noBlockers  bool
	maxHearts   int
	maxRainbows int
	maxHidden   int
	maxLocked   int
}

// Option A Campaign Testrun Ladder (13 escalating levels per theme: 5x5 warmups -> 8x8 64-tile finale).
// Gradual Special Pearl introduction: L1-2 pure basics -> L3-4 Hearts -> L5-6 +Rainbow -> L7-8 +Hidden -> L9-13 +Locked!
var campaignLadder = [LevelsPerChapter]tierTemplate{
	{cols: 5, rows: 5, difficulty: 0, noBlockers: true, maxHearts: 0, maxRainbows: 0, maxHidden: 0, maxLocked: 0},  // L1: Warm-Up I (no specials)
	{cols: 5, rows: 5, difficulty: 0, noBlockers: true, maxHearts: 0, maxRainbows: 0, maxHidden: 0, maxLocked: 0},  // L2: Warm-Up II (no specials)
	{cols: 5, rows: 5, difficulty: 1, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0}, // L3: Hearts introduced!
	{cols: 6, rows: 5, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0}, // L4: Hearts
	{cols: 6, rows: 6, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0}, // L5: + Rainbow introduced!
	{cols: 7, rows: 6, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0}, // L6: Hearts + Rainbow
	{cols: 7, rows: 7, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 2, maxLocked: 0}, // L7: + Hidden introduced!
	{cols: 8, rows: 6, difficulty: 6, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 0}, // L8: Hearts + Rainbow + Hidden
	{cols: 8, rows: 7, difficulty: 7, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 1}, // L9: + Locked introduced!
	{cols: 8, rows: 8, difficulty: 8, noBlockers: false, maxHearts: 3, maxRainbows: 1, maxHidden: 3, maxLocked: 2}, // L10: Full Suite (Artisan)
	{cols: 8, rows: 8, difficulty: 9, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 3, maxLocked: 2}, // L11: Full Suite (Virtuoso)
	{cols: 8, rows: 8, difficulty: 10, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 2}, // L12: Full Suite (Expert)
	{cols: 8, rows: 8, difficulty: 11, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 3}, // L13: Full Suite (Masterpiece 64 tiles)
}

var campaignNames = [NumChapters][LevelsPerChapter]string{
	// Campaign 0: Jewel Atelier (Theme 0)
	{
		"Sunbeam Brooch", "Dewdrop Ring", "Jewel Heart", "Sakura Bloom",
		"Royal Crown", "Emerald Clover", "Monarch Crest", "Sapphire Fan",
		"Velvet Lotus", "Nautilus Gold", "Imperial Tiara", "Starlight Filigree",
		"Grand Jewel Rose",
	},
	// Campaign 1: Cyber Arcade (Theme 1)
	{
		"Neon Spark", "Bit Halo", "Neon Pulse", "Synth Diamond",
		"Pixel Star", "Laser Spiral", "Arcade Core", "Vector Grid",
		"Flux Portal", "Hyper Matrix", "Volt Overdrive", "Quantum Circuit",
		"Cyber Singularity",
	},
	// Campaign 2: Pop Studio (Theme 2)
	{
		"Pop Dot", "Comic Ring", "Comic Star", "Pop Heart",
		"Halftone Bolt", "Warhol Bloom", "Boom Burst", "Retro Sun",
		"Pop Diamond", "Studio Crown", "Super Flash", "Gallery Splash",
		"Grand Pop Burst",
	},
	// Campaign 3: Cathedral Glass (Theme 3)
	{
		"Candle Shard", "Silver Chalice", "Prism Lantern", "Gothic Arch",
		"Angel Crest", "Aurora Spire", "Cathedral Cross", "Vespers Halo",
		"Radiant Choir", "Stained Compass", "Sapphire Nave", "Celestial Vault",
		"Grand Rose Window",
	},
}

var campaignColorOrders = [NumChapters][NumColors]uint8{
	{ColorGold, ColorTurquoise, ColorRuby, ColorAmethyst, ColorEmerald, ColorCobalt},
	{ColorCobalt, ColorRuby, ColorEmerald, ColorGold, ColorAmethyst, ColorTurquoise},
	{ColorGold, ColorRuby, ColorCobalt, ColorAmethyst, ColorEmerald, ColorTurquoise},
	{ColorGold, ColorTurquoise, ColorRuby, ColorCobalt, ColorAmethyst, ColorEmerald},
}

// buildCuratedArtworks constructs 4 independent Day-1 Campaigns x 13 escalating levels = 52 levels!
func buildCuratedArtworks() []ArtworkDef {
	arts := make([]ArtworkDef, 0, NumChapters*LevelsPerChapter)
	for ch := 0; ch < NumChapters; ch++ {
		pal := campaignColorOrders[ch][:]
		for tIdx, tpl := range campaignLadder {
			seed := uint32((ch+1)*10000 + (tIdx+1)*137 + 41)
			st := buildCampaignPattern(ch, tIdx, pal)
			arts = append(arts, ArtworkDef{
				ID:          len(arts),
				Chapter:     ch,
				Theme:       ch,
				Name:        campaignNames[ch][tIdx],
				Cols:        tpl.cols,
				Rows:        tpl.rows,
				Difficulty:  tpl.difficulty,
				Seed:        seed,
				NoBlockers:  tpl.noBlockers,
				MaxHearts:   tpl.maxHearts,
				MaxRainbows: tpl.maxRainbows,
				MaxHidden:   tpl.maxHidden,
				MaxLocked:   tpl.maxLocked,
				Stitches:    st,
			})
		}
	}
	return arts
}

// CuratedArtworks holds all 52 progressive campaign testrun levels (4 Campaigns x 13 levels).
var CuratedArtworks = buildCuratedArtworks()
