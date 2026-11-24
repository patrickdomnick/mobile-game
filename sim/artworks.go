package sim

const (
	ColorRose     = 0
	ColorIvory    = 1
	ColorSage     = 2
	ColorHoney    = 3
	ColorLavender = 4
	ColorSky      = 5
	NumColors     = 6
)

// PearlPalette holds RGB + iridescence for the 6 color-blind-friendly pastel gem-pearls.
var PearlPalette = [NumColors][4]float32{
	{0.88, 0.34, 0.48, 0.56}, // 0: Rose Quartz
	{0.97, 0.94, 0.87, 0.68}, // 1: Ivory Mother-of-Pearl
	{0.30, 0.68, 0.50, 0.48}, // 2: Sage Mint
	{0.92, 0.64, 0.22, 0.52}, // 3: Honey Gold
	{0.58, 0.44, 0.86, 0.60}, // 4: Lavender Mist
	{0.28, 0.62, 0.86, 0.54}, // 5: Sky Cerulean
}

// StitchPoint is one pearl placement inside the normalized embroidery hoop (radius <= 0.85).
type StitchPoint struct {
	X     float32
	Z     float32
	Color uint8
}

// ArtworkDef defines an embroidery pattern and its paired untangle board parameters.
type ArtworkDef struct {
	ID         int
	Name       string
	Cols       int
	Rows       int
	Difficulty int // 1 = intro, 2 = gentle, 3 = thoughtful
	Seed       uint32
	Stitches   []StitchPoint
}

// CuratedArtworks holds the full 8-motif Kishōtenketsu embroidery collection.
var CuratedArtworks = []ArtworkDef{
	{
		// 0 — Ki (Introduction): 9 pearls on a clean 3x3 board, 3 warm harmonious colors
		ID:         0,
		Name:       "Rose Heart",
		Cols:       3,
		Rows:       3,
		Difficulty: 1,
		Seed:       101,
		Stitches: []StitchPoint{
			{X: 0.00, Z: -0.26, Color: ColorIvory},
			{X: -0.34, Z: -0.46, Color: ColorRose},
			{X: 0.34, Z: -0.46, Color: ColorRose},
			{X: -0.58, Z: -0.14, Color: ColorRose},
			{X: 0.58, Z: -0.14, Color: ColorRose},
			{X: -0.40, Z: 0.24, Color: ColorHoney},
			{X: 0.40, Z: 0.24, Color: ColorHoney},
			{X: 0.00, Z: 0.56, Color: ColorRose},
			{X: 0.00, Z: 0.10, Color: ColorIvory},
		},
	},
	{
		// 1 — Shō (Development): 14 pearls on a 4x4 board, 4 colors
		ID:         1,
		Name:       "Sakura Blossom",
		Cols:       4,
		Rows:       4,
		Difficulty: 2,
		Seed:       202,
		Stitches: []StitchPoint{
			{X: 0.00, Z: 0.00, Color: ColorHoney},
			{X: 0.00, Z: -0.38, Color: ColorRose},
			{X: 0.36, Z: -0.12, Color: ColorRose},
			{X: 0.22, Z: 0.31, Color: ColorRose},
			{X: -0.22, Z: 0.31, Color: ColorRose},
			{X: -0.36, Z: -0.12, Color: ColorRose},
			{X: 0.00, Z: -0.72, Color: ColorIvory},
			{X: 0.68, Z: -0.22, Color: ColorIvory},
			{X: 0.42, Z: 0.58, Color: ColorIvory},
			{X: -0.42, Z: 0.58, Color: ColorIvory},
			{X: -0.68, Z: -0.22, Color: ColorIvory},
			{X: -0.58, Z: 0.28, Color: ColorSage},
			{X: 0.58, Z: 0.28, Color: ColorSage},
			{X: 0.00, Z: 0.66, Color: ColorSage},
		},
	},
	{
		// 2 — Shō (Development): 16 pearls on 4x4 board, 4 twilight colors
		ID:         2,
		Name:       "Crescent Moon",
		Cols:       4,
		Rows:       4,
		Difficulty: 2,
		Seed:       303,
		Stitches: []StitchPoint{
			{X: 0.14, Z: -0.68, Color: ColorHoney},
			{X: -0.26, Z: -0.58, Color: ColorIvory},
			{X: -0.56, Z: -0.30, Color: ColorIvory},
			{X: -0.64, Z: 0.08, Color: ColorIvory},
			{X: -0.50, Z: 0.44, Color: ColorIvory},
			{X: -0.16, Z: 0.66, Color: ColorHoney},
			{X: 0.22, Z: 0.64, Color: ColorHoney},
			{X: -0.18, Z: -0.26, Color: ColorHoney},
			{X: -0.28, Z: 0.08, Color: ColorHoney},
			{X: -0.10, Z: 0.36, Color: ColorHoney},
			{X: 0.34, Z: -0.26, Color: ColorLavender},
			{X: 0.56, Z: -0.02, Color: ColorSky},
			{X: 0.22, Z: 0.08, Color: ColorSky},
			{X: 0.46, Z: 0.28, Color: ColorLavender},
			{X: 0.64, Z: -0.40, Color: ColorLavender},
			{X: 0.58, Z: 0.52, Color: ColorSky},
		},
	},
	{
		// 3 — Ten (Twist): 18 pearls on 5x4 board, 5 iridescent colors — Morning Butterfly
		ID:         3,
		Name:       "Morning Butterfly",
		Cols:       5,
		Rows:       4,
		Difficulty: 2,
		Seed:       404,
		Stitches: []StitchPoint{
			// Body
			{X: 0.00, Z: -0.44, Color: ColorHoney},
			{X: 0.00, Z: -0.14, Color: ColorHoney},
			{X: 0.00, Z: 0.16, Color: ColorHoney},
			{X: 0.00, Z: 0.46, Color: ColorIvory},
			// Upper wings
			{X: -0.32, Z: -0.46, Color: ColorLavender},
			{X: 0.32, Z: -0.46, Color: ColorLavender},
			{X: -0.62, Z: -0.34, Color: ColorRose},
			{X: 0.62, Z: -0.34, Color: ColorRose},
			{X: -0.42, Z: -0.14, Color: ColorIvory},
			{X: 0.42, Z: -0.14, Color: ColorIvory},
			{X: -0.68, Z: -0.02, Color: ColorLavender},
			{X: 0.68, Z: -0.02, Color: ColorLavender},
			// Lower wings
			{X: -0.32, Z: 0.20, Color: ColorSky},
			{X: 0.32, Z: 0.20, Color: ColorSky},
			{X: -0.56, Z: 0.36, Color: ColorRose},
			{X: 0.56, Z: 0.36, Color: ColorRose},
			{X: -0.30, Z: 0.56, Color: ColorSky},
			{X: 0.30, Z: 0.56, Color: ColorSky},
		},
	},
	{
		// 4 — Ten (Twist): 19 pearls on 5x4 board, 4 cozy colors — Cozy Cat
		ID:         4,
		Name:       "Cozy Cat",
		Cols:       5,
		Rows:       4,
		Difficulty: 3,
		Seed:       505,
		Stitches: []StitchPoint{
			// Pointed ears
			{X: -0.50, Z: -0.60, Color: ColorIvory},
			{X: 0.50, Z: -0.60, Color: ColorIvory},
			{X: -0.46, Z: -0.34, Color: ColorRose},
			{X: 0.46, Z: -0.34, Color: ColorRose},
			// Forehead & cheeks
			{X: -0.18, Z: -0.40, Color: ColorIvory},
			{X: 0.18, Z: -0.40, Color: ColorIvory},
			{X: -0.62, Z: -0.02, Color: ColorIvory},
			{X: 0.62, Z: -0.02, Color: ColorIvory},
			{X: -0.52, Z: 0.32, Color: ColorIvory},
			{X: 0.52, Z: 0.32, Color: ColorIvory},
			{X: -0.22, Z: 0.54, Color: ColorIvory},
			{X: 0.22, Z: 0.54, Color: ColorIvory},
			{X: 0.00, Z: 0.60, Color: ColorIvory},
			// Eyes, rose nose & honey collar bell
			{X: -0.24, Z: -0.06, Color: ColorSage},
			{X: 0.24, Z: -0.06, Color: ColorSage},
			{X: 0.00, Z: 0.16, Color: ColorRose},
			{X: -0.24, Z: 0.28, Color: ColorHoney},
			{X: 0.24, Z: 0.28, Color: ColorHoney},
			{X: 0.00, Z: 0.38, Color: ColorHoney},
		},
	},
	{
		// 5 — Ten (Twist): 20 pearls on 5x5 board, 5 colors — Ocean Seashell
		ID:         5,
		Name:       "Ocean Seashell",
		Cols:       5,
		Rows:       5,
		Difficulty: 3,
		Seed:       606,
		Stitches: []StitchPoint{
			// Hinge base
			{X: 0.00, Z: 0.62, Color: ColorHoney},
			{X: -0.26, Z: 0.54, Color: ColorIvory},
			{X: 0.26, Z: 0.54, Color: ColorIvory},
			// Inner fan ribs
			{X: 0.00, Z: 0.24, Color: ColorIvory},
			{X: -0.32, Z: 0.18, Color: ColorSky},
			{X: 0.32, Z: 0.18, Color: ColorSky},
			{X: -0.58, Z: 0.14, Color: ColorRose},
			{X: 0.58, Z: 0.14, Color: ColorRose},
			// Mid scallop arc
			{X: 0.00, Z: -0.14, Color: ColorSky},
			{X: -0.30, Z: -0.18, Color: ColorIvory},
			{X: 0.30, Z: -0.18, Color: ColorIvory},
			{X: -0.58, Z: -0.18, Color: ColorLavender},
			{X: 0.58, Z: -0.18, Color: ColorLavender},
			// Outer scalloped crest
			{X: 0.00, Z: -0.62, Color: ColorRose},
			{X: -0.28, Z: -0.56, Color: ColorHoney},
			{X: 0.28, Z: -0.56, Color: ColorHoney},
			{X: -0.54, Z: -0.44, Color: ColorSky},
			{X: 0.54, Z: -0.44, Color: ColorSky},
			{X: -0.72, Z: -0.12, Color: ColorIvory},
			{X: 0.72, Z: -0.12, Color: ColorIvory},
		},
	},
	{
		// 6 — Ketsu (Synthesis): 21 pearls on 5x5 board, 4 botanical colors — Lucky Clover
		ID:         6,
		Name:       "Lucky Clover",
		Cols:       5,
		Rows:       5,
		Difficulty: 3,
		Seed:       707,
		Stitches: []StitchPoint{
			{X: 0.00, Z: 0.00, Color: ColorHoney},
			// Top leaf
			{X: -0.18, Z: -0.36, Color: ColorSage},
			{X: 0.18, Z: -0.36, Color: ColorSage},
			{X: 0.00, Z: -0.64, Color: ColorIvory},
			// Bottom leaf
			{X: -0.18, Z: 0.36, Color: ColorSage},
			{X: 0.18, Z: 0.36, Color: ColorSage},
			{X: 0.00, Z: 0.64, Color: ColorIvory},
			// Left leaf
			{X: -0.36, Z: -0.18, Color: ColorSage},
			{X: -0.36, Z: 0.18, Color: ColorSage},
			{X: -0.64, Z: 0.00, Color: ColorIvory},
			// Right leaf
			{X: 0.36, Z: -0.18, Color: ColorSage},
			{X: 0.36, Z: 0.18, Color: ColorSage},
			{X: 0.64, Z: 0.00, Color: ColorIvory},
			// Diagonal morning dewdrops
			{X: -0.44, Z: -0.44, Color: ColorSky},
			{X: 0.44, Z: -0.44, Color: ColorSky},
			{X: -0.44, Z: 0.44, Color: ColorSky},
			{X: 0.44, Z: 0.44, Color: ColorSky},
			// Inner gold shimmer
			{X: 0.00, Z: -0.28, Color: ColorHoney},
			{X: 0.00, Z: 0.28, Color: ColorHoney},
			{X: -0.28, Z: 0.00, Color: ColorHoney},
			{X: 0.28, Z: 0.00, Color: ColorHoney},
		},
	},
	{
		// 7 — Ketsu (Grand Finale): 24 pearls on 5x5 board, all 6 pastel gem colors — Starlight Wreath
		ID:         7,
		Name:       "Starlight Wreath",
		Cols:       5,
		Rows:       5,
		Difficulty: 3,
		Seed:       808,
		Stitches: []StitchPoint{
			// Inner 6-point jewel star
			{X: 0.00, Z: -0.34, Color: ColorHoney},
			{X: 0.29, Z: -0.17, Color: ColorRose},
			{X: 0.29, Z: 0.17, Color: ColorLavender},
			{X: 0.00, Z: 0.34, Color: ColorSky},
			{X: -0.29, Z: 0.17, Color: ColorSage},
			{X: -0.29, Z: -0.17, Color: ColorIvory},
			// Mid luminous ring (6 pearls rotated 30 deg)
			{X: 0.26, Z: -0.45, Color: ColorIvory},
			{X: 0.52, Z: 0.00, Color: ColorHoney},
			{X: 0.26, Z: 0.45, Color: ColorRose},
			{X: -0.26, Z: 0.45, Color: ColorLavender},
			{X: -0.52, Z: 0.00, Color: ColorSky},
			{X: -0.26, Z: -0.45, Color: ColorSage},
			// Outer crown (12 alternating pearls)
			{X: 0.00, Z: -0.74, Color: ColorRose},
			{X: 0.37, Z: -0.64, Color: ColorHoney},
			{X: 0.64, Z: -0.37, Color: ColorIvory},
			{X: 0.74, Z: 0.00, Color: ColorSage},
			{X: 0.64, Z: 0.37, Color: ColorSky},
			{X: 0.37, Z: 0.64, Color: ColorLavender},
			{X: 0.00, Z: 0.74, Color: ColorRose},
			{X: -0.37, Z: 0.64, Color: ColorHoney},
			{X: -0.64, Z: 0.37, Color: ColorIvory},
			{X: -0.74, Z: 0.00, Color: ColorSage},
			{X: -0.64, Z: -0.37, Color: ColorSky},
			{X: -0.37, Z: -0.64, Color: ColorLavender},
		},
	},
}
