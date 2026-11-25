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
	ThemeNoirBW       = 2
	ThemePopArt       = 3
	ThemeStainedGlass = 4
	NumThemes         = 5
)

// ThemePalettes defines high-pop, unmistakable 6-color jewel/neon/monochrome/pop/glass palettes.
// 4th channel encodes iridescence / emissive luster.
var ThemePalettes = [NumThemes][NumColors][4]float32{
	// 0: Jewel Atelier (Rich high-pop gemstones on deep sunlit slate-walnut)
	{
		{0.96, 0.15, 0.36, 0.52}, // 0: Ruby Crimson
		{0.12, 0.46, 0.98, 0.56}, // 1: Electric Cobalt
		{0.05, 0.78, 0.45, 0.50}, // 2: Emerald Jade
		{0.99, 0.72, 0.06, 0.58}, // 3: Solar Gold
		{0.64, 0.24, 0.98, 0.62}, // 4: Royal Amethyst
		{0.04, 0.82, 0.88, 0.55}, // 5: Bright Turquoise
	},
	// 1: Cyber Neon (Radiant electric synthwave)
	{
		{1.00, 0.10, 0.58, 0.95}, // 0: Hot Magenta
		{0.04, 0.92, 1.00, 0.95}, // 1: Electric Cyan
		{0.42, 1.00, 0.12, 0.92}, // 2: Acid Lime
		{1.00, 0.70, 0.04, 0.92}, // 3: Laser Amber
		{0.66, 0.22, 1.00, 0.95}, // 4: Ultraviolet
		{1.00, 0.32, 0.16, 0.92}, // 5: Plasma Coral
	},
	// 2: Noir Monochrome (Pure high-contrast B&W — paired with distinct WGSL geometric inlays!)
	{
		{0.97, 0.97, 0.99, 0.30}, // 0: Alabaster Solid White
		{0.09, 0.09, 0.11, 0.45}, // 1: Piano Obsidian Black
		{0.82, 0.83, 0.86, 0.55}, // 2: Chrome + Black Ring
		{0.22, 0.23, 0.26, 0.45}, // 3: Charcoal + White Ring
		{0.88, 0.88, 0.90, 0.40}, // 4: Ivory + Diagonal Noir Band
		{0.16, 0.16, 0.19, 0.50}, // 5: Onyx + Bright Diamond
	},
	// 3: Pop Art (Bold Warhol / Lichtenstein primaries)
	{
		{0.98, 0.14, 0.16, 0.30}, // 0: Pop Red
		{0.10, 0.38, 0.98, 0.30}, // 1: Pop Cobalt
		{0.04, 0.82, 0.54, 0.30}, // 2: Pop Mint
		{1.00, 0.84, 0.04, 0.30}, // 3: Comic Yellow
		{0.98, 0.22, 0.72, 0.30}, // 4: Hot Pink
		{1.00, 0.46, 0.04, 0.30}, // 5: Tangerine
	},
	// 4: Stained Glass (Cathedral translucent prism jewels)
	{
		{0.94, 0.14, 0.38, 0.82}, // 0: Garnet Rose
		{0.14, 0.52, 0.98, 0.85}, // 1: Cathedral Sapphire
		{0.08, 0.84, 0.56, 0.82}, // 2: Viridian Emerald
		{0.98, 0.68, 0.10, 0.84}, // 3: Amber Sun
		{0.70, 0.28, 0.98, 0.86}, // 4: Amethyst Prism
		{0.88, 0.96, 1.00, 0.90}, // 5: Diamond Opal
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

// ArtworkDef defines a substantial multi-layer embroidery pattern and paired untangle board.
type ArtworkDef struct {
	ID         int
	Name       string
	Cols       int
	Rows       int
	Difficulty int // 1..4
	Seed       uint32
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

func buildCuratedArtworks() []ArtworkDef {
	// 0: Jewel Heart (5x5, 21 pearls, 4 vivid colors, 3 layers)
	heart := []StitchPoint{
		// Layer 0: Core
		{0.00, -0.14, ColorGold, 0},
		{0.00, 0.14, ColorGold, 0},
		{-0.22, -0.02, ColorTurquoise, 0},
		{0.22, -0.02, ColorTurquoise, 0},
		// Layer 1: Inner Heart
		{-0.28, -0.34, ColorRuby, 1},
		{0.28, -0.34, ColorRuby, 1},
		{-0.46, -0.08, ColorRuby, 1},
		{0.46, -0.08, ColorRuby, 1},
		{-0.30, 0.24, ColorAmethyst, 1},
		{0.30, 0.24, ColorAmethyst, 1},
		{0.00, 0.44, ColorRuby, 1},
		// Layer 2: Outer Radiant Frame
		{-0.44, -0.58, ColorRuby, 2},
		{0.44, -0.58, ColorRuby, 2},
		{0.00, -0.42, ColorGold, 2},
		{-0.72, -0.26, ColorAmethyst, 2},
		{0.72, -0.26, ColorAmethyst, 2},
		{-0.68, 0.14, ColorTurquoise, 2},
		{0.68, 0.14, ColorTurquoise, 2},
		{-0.42, 0.50, ColorGold, 2},
		{0.42, 0.50, ColorGold, 2},
		{0.00, 0.74, ColorRuby, 2},
	}

	// 1: Sakura Mandala (5x5, 25 pearls, 4 colors, 3 layers)
	sakura := []StitchPoint{{0.0, 0.0, ColorGold, 0}}
	sakura = append(sakura, ringPoints(5, 0.26, -math.Pi/2, ColorRuby, ColorRuby, 0)...)
	sakura = append(sakura, ringPoints(5, 0.50, -math.Pi/2+math.Pi/5, ColorAmethyst, ColorAmethyst, 1)...)
	sakura = append(sakura, ringPoints(5, 0.56, -math.Pi/2, ColorRuby, ColorRuby, 1)...)
	sakura = append(sakura, ringPoints(9, 0.78, -math.Pi/2, ColorEmerald, ColorGold, 2)...)

	// 2: Lunar Eclipse (6x5, 28 pearls, 5 colors, 3 layers)
	lunar := []StitchPoint{
		// Layer 0: Inner moon glow
		{-0.16, -0.22, ColorGold, 0},
		{-0.26, 0.00, ColorGold, 0},
		{-0.16, 0.22, ColorGold, 0},
		{0.24, 0.00, ColorTurquoise, 0},
		{0.44, -0.18, ColorAmethyst, 0},
		{0.44, 0.18, ColorAmethyst, 0},
		// Layer 1: Crescent body
		{0.10, -0.52, ColorGold, 1},
		{-0.22, -0.48, ColorTurquoise, 1},
		{-0.46, -0.28, ColorCobalt, 1},
		{-0.54, 0.00, ColorCobalt, 1},
		{-0.46, 0.28, ColorCobalt, 1},
		{-0.22, 0.48, ColorTurquoise, 1},
		{0.10, 0.52, ColorGold, 1},
		{0.34, -0.42, ColorRuby, 1},
		{0.34, 0.42, ColorRuby, 1},
		{0.62, 0.00, ColorGold, 1},
	}
	lunar = append(lunar, ringPoints(12, 0.78, 0.0, ColorCobalt, ColorAmethyst, 2)...)

	// 3: Monarch Butterfly (6x6, 32 pearls, 5 colors, 3 layers)
	butterfly := []StitchPoint{
		// Layer 0: Body + core
		{0.0, -0.46, ColorGold, 0},
		{0.0, -0.22, ColorGold, 0},
		{0.0, 0.02, ColorGold, 0},
		{0.0, 0.26, ColorGold, 0},
		{0.0, 0.50, ColorTurquoise, 0},
		{-0.14, -0.66, ColorAmethyst, 0},
		{0.14, -0.66, ColorAmethyst, 0},
		// Layer 1: Inner wings
		{-0.28, -0.40, ColorRuby, 1}, {0.28, -0.40, ColorRuby, 1},
		{-0.48, -0.26, ColorRuby, 1}, {0.48, -0.26, ColorRuby, 1},
		{-0.30, -0.10, ColorGold, 1}, {0.30, -0.10, ColorGold, 1},
		{-0.28, 0.16, ColorCobalt, 1}, {0.28, 0.16, ColorCobalt, 1},
		{-0.46, 0.28, ColorCobalt, 1}, {0.46, 0.28, ColorCobalt, 1},
		{-0.26, 0.46, ColorTurquoise, 1}, {0.26, 0.46, ColorTurquoise, 1},
		// Layer 2: Outer scalloped wingtips
		{-0.52, -0.56, ColorAmethyst, 2}, {0.52, -0.56, ColorAmethyst, 2},
		{-0.74, -0.34, ColorRuby, 2}, {0.74, -0.34, ColorRuby, 2},
		{-0.78, -0.06, ColorAmethyst, 2}, {0.78, -0.06, ColorAmethyst, 2},
		{-0.62, -0.02, ColorTurquoise, 2}, {0.62, -0.02, ColorTurquoise, 2},
		{-0.70, 0.26, ColorCobalt, 2}, {0.70, 0.26, ColorCobalt, 2},
		{-0.54, 0.54, ColorRuby, 2}, {0.54, 0.54, ColorRuby, 2},
		{0.0, 0.74, ColorGold, 2},
	}

	// 4: Royal Lotus (6x6, 34 pearls, 5 colors, 3 layers)
	lotus := []StitchPoint{{0.0, 0.0, ColorGold, 0}}
	lotus = append(lotus, ringPoints(6, 0.26, -math.Pi/2, ColorRuby, ColorAmethyst, 0)...)
	lotus = append(lotus, ringPoints(12, 0.52, -math.Pi/2, ColorRuby, ColorGold, 1)...)
	lotus = append(lotus, ringPoints(15, 0.78, -math.Pi/2, ColorEmerald, ColorTurquoise, 2)...)

	// 5: Nautilus Prism (6x6, 36 pearls, 6 colors, 3 layers)
	nautilus := make([]StitchPoint, 0, 36)
	for i := 0; i < 36; i++ {
		t := float64(i) / 35.0
		ang := t * 4.2 * math.Pi
		rad := 0.10 + t*0.72
		layer := uint8(0)
		if i >= 24 {
			layer = 2
		} else if i >= 12 {
			layer = 1
		}
		nautilus = append(nautilus, StitchPoint{
			X:     float32(math.Cos(ang) * rad),
			Z:     float32(math.Sin(ang) * rad),
			Color: uint8(i % NumColors),
			Layer: layer,
		})
	}

	// 6: Emerald Clover (7x6, 40 pearls, 6 colors, 3 layers)
	clover := []StitchPoint{{0.0, 0.0, ColorGold, 0}}
	clover = append(clover, ringPoints(4, 0.24, math.Pi/4, ColorGold, ColorGold, 0)...)
	clover = append(clover, ringPoints(8, 0.42, 0.0, ColorEmerald, ColorTurquoise, 1)...)
	clover = append(clover, ringPoints(12, 0.62, math.Pi/12, ColorEmerald, ColorCobalt, 1)...)
	clover = append(clover, ringPoints(15, 0.80, 0.0, ColorRuby, ColorAmethyst, 2)...)

	// 7: Grand Starlight (7x7, 45 pearls, all 6 jewel colors, 3 rich layers!)
	starlight := []StitchPoint{{0.0, 0.0, ColorGold, 0}}
	starlight = append(starlight, ringPoints(6, 0.24, -math.Pi/2, ColorRuby, ColorTurquoise, 0)...)
	starlight = append(starlight, ringPoints(12, 0.48, -math.Pi/2, ColorGold, ColorAmethyst, 1)...)
	starlight = append(starlight, ringPoints(12, 0.66, -math.Pi/2+math.Pi/12, ColorCobalt, ColorEmerald, 2)...)
	starlight = append(starlight, ringPoints(14, 0.82, -math.Pi/2, ColorRuby, ColorGold, 2)...)

	return []ArtworkDef{
		{ID: 0, Name: "Jewel Heart", Cols: 5, Rows: 5, Difficulty: 2, Seed: 1101, Stitches: heart},
		{ID: 1, Name: "Sakura Mandala", Cols: 5, Rows: 5, Difficulty: 2, Seed: 2202, Stitches: sakura},
		{ID: 2, Name: "Lunar Eclipse", Cols: 6, Rows: 5, Difficulty: 3, Seed: 3303, Stitches: lunar},
		{ID: 3, Name: "Monarch Wing", Cols: 6, Rows: 6, Difficulty: 3, Seed: 4404, Stitches: butterfly},
		{ID: 4, Name: "Royal Lotus", Cols: 6, Rows: 6, Difficulty: 3, Seed: 5505, Stitches: lotus},
		{ID: 5, Name: "Nautilus Prism", Cols: 6, Rows: 6, Difficulty: 4, Seed: 6606, Stitches: nautilus},
		{ID: 6, Name: "Emerald Clover", Cols: 7, Rows: 6, Difficulty: 4, Seed: 7707, Stitches: clover},
		{ID: 7, Name: "Grand Starlight", Cols: 7, Rows: 7, Difficulty: 4, Seed: 8808, Stitches: starlight},
	}
}

// CuratedArtworks holds the 8 substantial, multi-layered embroidery patterns (21 to 45 pearls).
var CuratedArtworks = buildCuratedArtworks()
