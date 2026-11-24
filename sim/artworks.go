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

// CuratedArtworks holds the handcrafted starter collection (Slice 1: 3 Kishōtenketsu stages).
var CuratedArtworks = []ArtworkDef{
	{
		// Ki (Introduction): 9 pearls on a clean 3x3 board, 3 warm harmonious colors
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
		// Shō (Development): 14 pearls on a 4x4 board, 4 colors — silk tray planning emerges naturally
		ID:         1,
		Name:       "Sakura Blossom",
		Cols:       4,
		Rows:       4,
		Difficulty: 2,
		Seed:       202,
		Stitches: []StitchPoint{
			// Golden center
			{X: 0.00, Z: 0.00, Color: ColorHoney},
			// 5 inner blush petals
			{X: 0.00, Z: -0.38, Color: ColorRose},
			{X: 0.36, Z: -0.12, Color: ColorRose},
			{X: 0.22, Z: 0.31, Color: ColorRose},
			{X: -0.22, Z: 0.31, Color: ColorRose},
			{X: -0.36, Z: -0.12, Color: ColorRose},
			// 5 outer ivory pearl petal tips
			{X: 0.00, Z: -0.72, Color: ColorIvory},
			{X: 0.68, Z: -0.22, Color: ColorIvory},
			{X: 0.42, Z: 0.58, Color: ColorIvory},
			{X: -0.42, Z: 0.58, Color: ColorIvory},
			{X: -0.68, Z: -0.22, Color: ColorIvory},
			// 3 sage leaves tucked at the base
			{X: -0.58, Z: 0.28, Color: ColorSage},
			{X: 0.58, Z: 0.28, Color: ColorSage},
			{X: 0.00, Z: 0.66, Color: ColorSage},
		},
	},
	{
		// Ten (Twist): 16 pearls on a 4x4 board, 4 twilight colors — deeper directional untangling
		ID:         2,
		Name:       "Crescent Moon",
		Cols:       4,
		Rows:       4,
		Difficulty: 3,
		Seed:       303,
		Stitches: []StitchPoint{
			// Outer crescent arc (Ivory & Honey)
			{X: 0.14, Z: -0.68, Color: ColorHoney},
			{X: -0.26, Z: -0.58, Color: ColorIvory},
			{X: -0.56, Z: -0.30, Color: ColorIvory},
			{X: -0.64, Z: 0.08, Color: ColorIvory},
			{X: -0.50, Z: 0.44, Color: ColorIvory},
			{X: -0.16, Z: 0.66, Color: ColorHoney},
			{X: 0.22, Z: 0.64, Color: ColorHoney},
			// Inner glowing crescent rim
			{X: -0.18, Z: -0.26, Color: ColorHoney},
			{X: -0.28, Z: 0.08, Color: ColorHoney},
			{X: -0.10, Z: 0.36, Color: ColorHoney},
			// Twilight stars (Lavender & Sky)
			{X: 0.34, Z: -0.26, Color: ColorLavender},
			{X: 0.56, Z: -0.02, Color: ColorSky},
			{X: 0.22, Z: 0.08, Color: ColorSky},
			{X: 0.46, Z: 0.28, Color: ColorLavender},
			{X: 0.64, Z: -0.40, Color: ColorLavender},
			{X: 0.58, Z: 0.52, Color: ColorSky},
		},
	},
}
