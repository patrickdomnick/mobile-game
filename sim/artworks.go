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
	LevelsPerChapter = 8
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
// tagged with Layer (0=Core, 1=Mid, 2=Outer) for Vampire Survivors-style ring celebrations!
type StitchPoint struct {
	X     float32
	Z     float32
	Color uint8
	Layer uint8
}

// ArtworkDef defines a theme-matched, multi-layer embroidery pattern and paired untangle board.
type ArtworkDef struct {
	ID         int
	Chapter    int // 0..3
	Theme      int // Visual theme natively bound to this chapter/pattern
	Name       string
	Cols       int
	Rows       int
	Difficulty int // 1..4
	Seed       uint32
	NoBlockers bool // When true, every starting tile has an unobstructed outward lane
	MaxHearts  int  // 0 = auto (2..3), capped strictly at MaxHeartsPerLevel (3)
	Stitches   []StitchPoint
}

func ringPoints(count int, radius float64, offsetRad float64, cEven, cOdd uint8, layer uint8) []StitchPoint {
	pts := make([]StitchPoint, 0, count)
	for i := 0; i < count; i++ {
		ang := offsetRad + float64(i)*(2.0*math.Pi/float64(count))
		c := cEven
		if i%2 == 1 {
			c = cOdd
		}
		pts = append(pts, StitchPoint{
			X:     float32(math.Cos(ang) * radius),
			Z:     float32(math.Sin(ang) * radius),
			Color: c,
			Layer: layer,
		})
	}
	return pts
}

func starPoints(points int, outerR, innerR float64, cOuter, cInner uint8, layer uint8) []StitchPoint {
	pts := make([]StitchPoint, 0, points*2)
	for i := 0; i < points*2; i++ {
		ang := -math.Pi/2 + float64(i)*(math.Pi/float64(points))
		r := outerR
		c := cOuter
		if i%2 == 1 {
			r = innerR
			c = cInner
		}
		pts = append(pts, StitchPoint{
			X:     float32(math.Cos(ang) * r),
			Z:     float32(math.Sin(ang) * r),
			Color: c,
			Layer: layer,
		})
	}
	return pts
}

func diamondRing(radius float64, cAxis, cDiag uint8, layer uint8) []StitchPoint {
	return []StitchPoint{
		{0, float32(-radius), cAxis, layer},
		{float32(radius), 0, cAxis, layer},
		{0, float32(radius), cAxis, layer},
		{float32(-radius), 0, cAxis, layer},
		{float32(radius * 0.55), float32(-radius * 0.55), cDiag, layer},
		{float32(radius * 0.55), float32(radius * 0.55), cDiag, layer},
		{float32(-radius * 0.55), float32(radius * 0.55), cDiag, layer},
		{float32(-radius * 0.55), float32(-radius * 0.55), cDiag, layer},
	}
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
		ang := t * turns * 2.0 * math.Pi
		rad := 0.10 + t*0.72
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

func buildSymmetricGridMotif(pairs [][2]float32, center []StitchPoint, c0, c1, c2 uint8) []StitchPoint {
	pts := make([]StitchPoint, 0, len(center)+len(pairs)*2)
	pts = append(pts, center...)
	for i, pr := range pairs {
		layer := uint8(1)
		col := c1
		if i >= len(pairs)/2 {
			layer = 2
			col = c2
		} else if i < len(pairs)/4 {
			layer = 0
			col = c0
		}
		pts = append(pts,
			StitchPoint{X: -pr[0], Z: pr[1], Color: col, Layer: layer},
			StitchPoint{X: pr[0], Z: pr[1], Color: col, Layer: layer},
		)
	}
	return pts
}

// buildCuratedArtworks constructs 4 vibrant native Thematic Chapters x 8 patterns = 32 handcrafted levels!
func buildCuratedArtworks() []ArtworkDef {
	arts := make([]ArtworkDef, 0, NumChapters*LevelsPerChapter)
	add := func(chapter, theme int, name string, cols, rows, diff int, seed uint32, st []StitchPoint) {
		arts = append(arts, ArtworkDef{
			ID:         len(arts),
			Chapter:    chapter,
			Theme:      theme,
			Name:       name,
			Cols:       cols,
			Rows:       rows,
			Difficulty: diff,
			Seed:       seed,
			Stitches:   st,
		})
	}

	// =========================================================================
	// CHAPTER 0: JEWEL ATELIER (Theme 0 — Rich Sunlit Gemstones, 8 patterns)
	// =========================================================================
	add(0, ThemeJewelAtelier, "Jewel Heart", 5, 5, 2, 1101,
		buildHeartStitches(ColorGold, ColorTurquoise, ColorRuby, ColorAmethyst))

	sakura := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(5, 0.26, -math.Pi/2, ColorRuby, ColorRuby, 0)...)
	sakura = append(sakura, ringPoints(5, 0.50, -math.Pi/2+math.Pi/5, ColorAmethyst, ColorAmethyst, 1)...)
	sakura = append(sakura, ringPoints(5, 0.56, -math.Pi/2, ColorRuby, ColorRuby, 1)...)
	sakura = append(sakura, ringPoints(9, 0.78, -math.Pi/2, ColorEmerald, ColorGold, 2)...)
	add(0, ThemeJewelAtelier, "Sakura Mandala", 5, 5, 2, 2202, sakura)

	crown := []StitchPoint{
		{0, 0.36, ColorGold, 0}, {-0.26, 0.36, ColorGold, 0}, {0.26, 0.36, ColorGold, 0},
		{-0.52, 0.36, ColorGold, 0}, {0.52, 0.36, ColorGold, 0},
		{0, 0.10, ColorRuby, 1}, {-0.28, 0.12, ColorCobalt, 1}, {0.28, 0.12, ColorCobalt, 1},
		{-0.56, 0.12, ColorEmerald, 1}, {0.56, 0.12, ColorEmerald, 1},
		{0, -0.18, ColorGold, 1}, {-0.32, -0.14, ColorRuby, 1}, {0.32, -0.14, ColorRuby, 1},
		{-0.60, -0.16, ColorGold, 1}, {0.60, -0.16, ColorGold, 1},
		{0, -0.52, ColorRuby, 2}, {-0.38, -0.44, ColorCobalt, 2}, {0.38, -0.44, ColorCobalt, 2},
		{-0.68, -0.42, ColorGold, 2}, {0.68, -0.42, ColorGold, 2},
		{0, -0.74, ColorGold, 2}, {-0.44, -0.68, ColorAmethyst, 2}, {0.44, -0.68, ColorAmethyst, 2},
		{-0.40, 0.58, ColorCobalt, 2}, {0.40, 0.58, ColorCobalt, 2}, {0, 0.60, ColorRuby, 2},
		{-0.70, 0.34, ColorAmethyst, 2}, {0.70, 0.34, ColorAmethyst, 2},
	}
	add(0, ThemeJewelAtelier, "Royal Crown", 6, 5, 3, 3303, crown)

	clover := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(4, 0.24, math.Pi/4, ColorGold, ColorTurquoise, 0)...)
	clover = append(clover, ringPoints(8, 0.46, 0, ColorEmerald, ColorTurquoise, 1)...)
	clover = append(clover, ringPoints(16, 0.74, math.Pi/16, ColorEmerald, ColorCobalt, 2)...)
	add(0, ThemeJewelAtelier, "Emerald Clover", 6, 5, 3, 4404, clover)

	lotus := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(6, 0.25, -math.Pi/2, ColorRuby, ColorAmethyst, 0)...)
	lotus = append(lotus, ringPoints(12, 0.52, -math.Pi/2, ColorRuby, ColorGold, 1)...)
	lotus = append(lotus, ringPoints(14, 0.78, -math.Pi/2, ColorEmerald, ColorTurquoise, 2)...)
	add(0, ThemeJewelAtelier, "Royal Lotus", 6, 6, 3, 5505, lotus)

	butterfly := buildSymmetricGridMotif(
		[][2]float32{
			{0.26, -0.36}, {0.48, -0.24}, {0.30, -0.06}, {0.26, 0.18}, {0.44, 0.30}, {0.26, 0.46},
			{0.54, -0.54}, {0.74, -0.32}, {0.76, -0.04}, {0.62, 0.08}, {0.68, 0.28}, {0.52, 0.54}, {0.16, -0.64},
		},
		[]StitchPoint{
			{0, -0.44, ColorGold, 0}, {0, -0.20, ColorGold, 0}, {0, 0.04, ColorGold, 0},
			{0, 0.28, ColorGold, 0}, {0, 0.52, ColorTurquoise, 0}, {0, 0.74, ColorGold, 2},
		},
		ColorRuby, ColorCobalt, ColorAmethyst,
	)
	add(0, ThemeJewelAtelier, "Monarch Wing", 6, 6, 3, 6606, butterfly)

	add(0, ThemeJewelAtelier, "Nautilus Prism", 6, 6, 4, 7707,
		buildSpiralStitches(36, 2.1, []uint8{ColorRuby, ColorCobalt, ColorEmerald, ColorGold, ColorAmethyst, ColorTurquoise}))

	starlight := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(6, 0.24, -math.Pi/2, ColorRuby, ColorTurquoise, 0)...)
	starlight = append(starlight, ringPoints(12, 0.48, -math.Pi/2, ColorGold, ColorAmethyst, 1)...)
	starlight = append(starlight, ringPoints(10, 0.66, -math.Pi/2+math.Pi/10, ColorCobalt, ColorEmerald, 2)...)
	starlight = append(starlight, ringPoints(12, 0.81, -math.Pi/2, ColorRuby, ColorGold, 2)...)
	add(0, ThemeJewelAtelier, "Grand Starlight", 7, 6, 4, 8808, starlight)

	// =========================================================================
	// CHAPTER 1: CYBER ARCADE (Theme 1 — Electric Synthwave Neon, 8 patterns)
	// =========================================================================
	neonPulse := append(diamondRing(0.28, ColorCobalt, ColorRuby, 0), diamondRing(0.54, ColorEmerald, ColorGold, 1)...)
	neonPulse = append(neonPulse, diamondRing(0.78, ColorAmethyst, ColorCobalt, 2)...)
	add(1, ThemeCyberNeon, "Neon Pulse", 5, 5, 2, 10101, neonPulse)

	invader := buildSymmetricGridMotif(
		[][2]float32{
			{0.20, -0.18}, {0.42, -0.18}, {0.20, 0.04}, {0.44, 0.04}, {0.66, 0.04},
			{0.24, -0.44}, {0.44, -0.64}, {0.66, 0.28}, {0.44, 0.28}, {0.22, 0.48}, {0.52, 0.54},
		},
		[]StitchPoint{{0, -0.18, ColorCobalt, 0}, {0, 0.04, ColorRuby, 0}, {0, 0.26, ColorEmerald, 1}, {0, -0.44, ColorGold, 1}},
		ColorCobalt, ColorRuby, ColorEmerald,
	)
	add(1, ThemeCyberNeon, "Pixel Invader", 6, 5, 3, 10202, invader)

	synthSun := append([]StitchPoint{{0, -0.18, ColorGold, 0}}, ringPoints(6, 0.28, 0, ColorGold, ColorTurquoise, 0)...)
	synthSun = append(synthSun, ringPoints(9, 0.54, 0, ColorRuby, ColorAmethyst, 1)...)
	synthSun = append(synthSun,
		StitchPoint{-0.70, 0.36, ColorCobalt, 2}, StitchPoint{-0.35, 0.36, ColorCobalt, 2},
		StitchPoint{0.0, 0.36, ColorCobalt, 2}, StitchPoint{0.35, 0.36, ColorCobalt, 2},
		StitchPoint{0.70, 0.36, ColorCobalt, 2},
		StitchPoint{-0.56, 0.58, ColorRuby, 2}, StitchPoint{-0.18, 0.58, ColorRuby, 2},
		StitchPoint{0.18, 0.58, ColorRuby, 2}, StitchPoint{0.56, 0.58, ColorRuby, 2},
		StitchPoint{-0.36, 0.76, ColorEmerald, 2}, StitchPoint{0.0, 0.76, ColorEmerald, 2},
		StitchPoint{0.36, 0.76, ColorEmerald, 2},
	)
	add(1, ThemeCyberNeon, "Synth Horizon", 6, 5, 3, 10303, synthSun)

	laserGrid := append(ringPoints(6, 0.24, 0, ColorCobalt, ColorRuby, 0), ringPoints(10, 0.50, math.Pi/10, ColorEmerald, ColorAmethyst, 1)...)
	laserGrid = append(laserGrid, ringPoints(14, 0.78, 0, ColorCobalt, ColorGold, 2)...)
	add(1, ThemeCyberNeon, "Laser Grid", 6, 5, 3, 10404, laserGrid)

	circuit := append(diamondRing(0.28, ColorEmerald, ColorCobalt, 0), ringPoints(12, 0.54, 0, ColorRuby, ColorAmethyst, 1)...)
	circuit = append(circuit, ringPoints(12, 0.78, math.Pi/12, ColorCobalt, ColorTurquoise, 2)...)
	add(1, ThemeCyberNeon, "Cyber Circuit", 6, 6, 3, 10505, circuit)

	add(1, ThemeCyberNeon, "Hyper Portal", 6, 6, 3, 10606,
		buildSpiralStitches(34, 2.2, []uint8{ColorCobalt, ColorRuby, ColorAmethyst, ColorEmerald, ColorGold}))

	bolt := buildSymmetricGridMotif(
		[][2]float32{
			{0.18, -0.56}, {0.36, -0.34}, {0.22, -0.14}, {0.48, -0.10}, {0.68, -0.10},
			{0.24, 0.14}, {0.50, 0.14}, {0.36, 0.36}, {0.18, 0.58},
			{0.62, -0.44}, {0.62, 0.44}, {0.76, -0.22}, {0.76, 0.22}, {0.44, -0.64}, {0.44, 0.64},
		},
		[]StitchPoint{
			{0, -0.76, ColorGold, 0}, {0, -0.38, ColorGold, 0}, {0, 0, ColorCobalt, 0},
			{0, 0.38, ColorGold, 1}, {0, 0.76, ColorGold, 2}, {0, -0.18, ColorRuby, 1},
		},
		ColorGold, ColorCobalt, ColorRuby,
	)
	add(1, ThemeCyberNeon, "Plasma Bolt", 6, 6, 4, 10707, bolt)

	matrix := append([]StitchPoint{{0, 0, ColorEmerald, 0}}, ringPoints(7, 0.25, 0, ColorEmerald, ColorCobalt, 0)...)
	matrix = append(matrix, ringPoints(14, 0.52, 0, ColorRuby, ColorAmethyst, 1)...)
	matrix = append(matrix, ringPoints(16, 0.79, math.Pi/16, ColorCobalt, ColorTurquoise, 2)...)
	add(1, ThemeCyberNeon, "Matrix Core", 7, 6, 4, 10808, matrix)

	// =========================================================================
	// CHAPTER 2: POP STUDIO (Theme 2 — Bold Comic & Warhol Primaries, 8 patterns)
	// =========================================================================
	cStar := append([]StitchPoint{{0, 0, ColorGold, 0}}, starPoints(5, 0.44, 0.22, ColorRuby, ColorGold, 0)...)
	cStar = append(cStar, ringPoints(13, 0.76, -math.Pi/2, ColorCobalt, ColorAmethyst, 2)...)
	add(2, ThemePopArt, "Comic Star", 5, 5, 2, 11101, cStar)

	popHeart := append(buildHeartStitches(ColorGold, ColorCobalt, ColorRuby, ColorAmethyst),
		StitchPoint{-0.76, -0.54, ColorGold, 2}, StitchPoint{0.76, -0.54, ColorGold, 2},
		StitchPoint{-0.70, 0.48, ColorEmerald, 2}, StitchPoint{0.70, 0.48, ColorEmerald, 2},
		StitchPoint{0, -0.72, ColorTurquoise, 2},
	)
	add(2, ThemePopArt, "Pop Heart", 6, 5, 3, 11202, popHeart)

	pBolt := append([]StitchPoint{{0, 0, ColorGold, 0}}, starPoints(6, 0.46, 0.24, ColorGold, ColorRuby, 0)...)
	pBolt = append(pBolt, ringPoints(15, 0.77, 0, ColorCobalt, ColorTurquoise, 2)...)
	add(2, ThemePopArt, "Halftone Bolt", 6, 5, 3, 11303, pBolt)

	warhol := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(6, 0.24, 0, ColorGold, ColorTurquoise, 0)...)
	warhol = append(warhol, ringPoints(11, 0.50, 0, ColorAmethyst, ColorRuby, 1)...)
	warhol = append(warhol, ringPoints(12, 0.78, math.Pi/12, ColorCobalt, ColorEmerald, 2)...)
	add(2, ThemePopArt, "Warhol Flower", 6, 5, 3, 11404, warhol)

	boom := append(starPoints(7, 0.44, 0.24, ColorRuby, ColorGold, 0), starPoints(9, 0.80, 0.56, ColorCobalt, ColorAmethyst, 2)...)
	add(2, ThemePopArt, "Boom Burst", 6, 6, 3, 11505, boom)

	retroSun := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(7, 0.25, 0, ColorGold, ColorTurquoise, 0)...)
	retroSun = append(retroSun, ringPoints(12, 0.52, 0, ColorRuby, ColorGold, 1)...)
	retroSun = append(retroSun, ringPoints(14, 0.79, 0, ColorCobalt, ColorAmethyst, 2)...)
	add(2, ThemePopArt, "Retro Sun", 6, 6, 3, 11606, retroSun)

	popDia := append(diamondRing(0.24, ColorGold, ColorRuby, 0), diamondRing(0.50, ColorCobalt, ColorAmethyst, 1)...)
	popDia = append(popDia, ringPoints(20, 0.78, 0, ColorEmerald, ColorTurquoise, 2)...)
	add(2, ThemePopArt, "Pop Diamond", 6, 6, 4, 11707, popDia)

	sCrown := append([]StitchPoint{{0, 0, ColorGold, 0}}, starPoints(8, 0.44, 0.24, ColorRuby, ColorGold, 0)...)
	sCrown = append(sCrown, ringPoints(21, 0.79, -math.Pi/2, ColorCobalt, ColorEmerald, 2)...)
	add(2, ThemePopArt, "Studio Crown", 7, 6, 4, 11808, sCrown)

	// =========================================================================
	// CHAPTER 3: CATHEDRAL GLASS (Theme 3 — Glowing Stained Glass, 8 patterns)
	// =========================================================================
	lantern := append([]StitchPoint{{0, 0, ColorGold, 0}}, diamondRing(0.28, ColorGold, ColorTurquoise, 0)...)
	lantern = append(lantern, ringPoints(8, 0.52, math.Pi/8, ColorRuby, ColorAmethyst, 1)...)
	lantern = append(lantern, ringPoints(11, 0.78, -math.Pi/2, ColorCobalt, ColorEmerald, 2)...)
	add(3, ThemeStainedGlass, "Prism Lantern", 6, 5, 3, 12101, lantern)

	chalice := buildSymmetricGridMotif(
		[][2]float32{
			{0.20, -0.50}, {0.42, -0.44}, {0.58, -0.28}, {0.46, -0.06}, {0.26, 0.08},
			{0.18, 0.30}, {0.36, 0.56}, {0.58, 0.64}, {0.68, -0.54}, {0.28, -0.70},
			{0.72, -0.02}, {0.64, 0.32},
		},
		[]StitchPoint{
			{0, -0.58, ColorGold, 0}, {0, -0.32, ColorTurquoise, 0}, {0, -0.06, ColorCobalt, 0},
			{0, 0.22, ColorGold, 1}, {0, 0.48, ColorGold, 1}, {0, 0.68, ColorRuby, 2},
		},
		ColorGold, ColorCobalt, ColorAmethyst,
	)
	add(3, ThemeStainedGlass, "Sapphire Chalice", 6, 5, 3, 12202, chalice)

	arch := append(ringPoints(8, 0.26, -math.Pi/2, ColorGold, ColorTurquoise, 0), ringPoints(10, 0.52, -math.Pi/2, ColorCobalt, ColorAmethyst, 1)...)
	arch = append(arch, ringPoints(14, 0.78, -math.Pi/2, ColorRuby, ColorEmerald, 2)...)
	add(3, ThemeStainedGlass, "Gothic Arch", 6, 6, 3, 12303, arch)

	wings := buildSymmetricGridMotif(
		[][2]float32{
			{0.22, -0.30}, {0.42, -0.42}, {0.62, -0.48}, {0.76, -0.30}, {0.78, -0.04},
			{0.58, -0.14}, {0.38, -0.04}, {0.68, 0.22}, {0.48, 0.22}, {0.26, 0.22},
			{0.56, 0.46}, {0.34, 0.50}, {0.18, 0.68}, {0.24, -0.66},
		},
		[]StitchPoint{
			{0, -0.50, ColorTurquoise, 0}, {0, -0.22, ColorGold, 0}, {0, 0.06, ColorGold, 0},
			{0, 0.34, ColorTurquoise, 1}, {0, 0.62, ColorCobalt, 1}, {0, -0.76, ColorGold, 2},
		},
		ColorTurquoise, ColorCobalt, ColorAmethyst,
	)
	add(3, ThemeStainedGlass, "Angel Wings", 6, 6, 3, 12404, wings)

	catCross := append([]StitchPoint{{0, 0, ColorGold, 0}}, diamondRing(0.28, ColorRuby, ColorGold, 0)...)
	catCross = append(catCross, ringPoints(12, 0.54, 0, ColorCobalt, ColorAmethyst, 1)...)
	catCross = append(catCross, ringPoints(15, 0.80, -math.Pi/2, ColorEmerald, ColorTurquoise, 2)...)
	add(3, ThemeStainedGlass, "Cathedral Cross", 6, 6, 4, 12505, catCross)

	add(3, ThemeStainedGlass, "Aurora Spire", 7, 6, 4, 12606,
		buildSpiralStitches(38, 2.3, []uint8{ColorEmerald, ColorCobalt, ColorAmethyst, ColorRuby, ColorGold, ColorTurquoise}))

	roseWin := append([]StitchPoint{{0, 0, ColorGold, 0}}, ringPoints(7, 0.24, -math.Pi/2, ColorRuby, ColorGold, 0)...)
	roseWin = append(roseWin, ringPoints(14, 0.50, -math.Pi/2, ColorCobalt, ColorAmethyst, 1)...)
	roseWin = append(roseWin, ringPoints(20, 0.79, -math.Pi/2, ColorEmerald, ColorTurquoise, 2)...)
	add(3, ThemeStainedGlass, "Rose Window", 7, 6, 4, 12707, roseWin)

	vault := append([]StitchPoint{{0, 0, ColorTurquoise, 0}}, ringPoints(8, 0.24, 0, ColorGold, ColorRuby, 0)...)
	vault = append(vault, ringPoints(16, 0.52, math.Pi/16, ColorCobalt, ColorAmethyst, 1)...)
	vault = append(vault, ringPoints(20, 0.80, 0, ColorEmerald, ColorGold, 2)...)
	add(3, ThemeStainedGlass, "Celestial Vault", 7, 7, 4, 12808, vault)

	return arts
}

// CuratedArtworks holds all 32 handcrafted, vibrant theme-matched patterns across 4 native Chapters.
var CuratedArtworks = buildCuratedArtworks()
