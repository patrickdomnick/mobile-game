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
	LevelsPerChapter = 50
)

// ThemePalettes defines 4 vibrant, unmistakable high-pop 6-color themes with maximum hue separation.
// 4th channel encodes iridescence / emissive luster.
var ThemePalettes = [NumThemes][NumColors][4]float32{
	// 0: Jewel Atelier (Rich, sharply separated gemstones on deep sunlit slate-walnut)
	{
		{0.96, 0.08, 0.16, 0.50}, // 0: Scarlet Ruby
		{0.08, 0.36, 0.98, 0.56}, // 1: Royal Cobalt
		{0.04, 0.80, 0.32, 0.50}, // 2: Emerald Jade
		{1.00, 0.78, 0.04, 0.56}, // 3: Sunbeam Gold
		{0.62, 0.16, 0.98, 0.60}, // 4: Vivid Amethyst
		{0.02, 0.86, 0.94, 0.55}, // 5: Aqua Cyan
	},
	// 1: Cyber Arcade (Crisp electric synthwave spectrum)
	{
		{1.00, 0.08, 0.56, 0.95}, // 0: Hot Magenta
		{0.02, 0.92, 1.00, 0.95}, // 1: Electric Cyan
		{0.44, 1.00, 0.08, 0.92}, // 2: Acid Lime
		{1.00, 0.64, 0.02, 0.92}, // 3: Laser Amber
		{0.58, 0.18, 1.00, 0.95}, // 4: Ultraviolet
		{1.00, 0.18, 0.10, 0.92}, // 5: Flame Red
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
	Difficulty  int // 0 = zero-blocker warm-up, 1..11 = sawtooth logic difficulty
	Seed        uint32
	NoBlockers  bool  // When true, every starting tile has an unobstructed outward lane
	MaxHearts   int   // 0..3 sculpted 3D Heart Pearls
	MaxRainbows int   // 0..2 extra Rainbow Wild Pearls on board
	MaxHidden   int   // 0..4 Hidden (obsidian-black) Pearls
	MaxLocked   int   // 0..3 Locked (clear-4-neighbors) Pearls
	BoardShape  uint8 // 0 = centered cluster, 1..20 = sculpted pixel-art fun board shape
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

type tierTemplate struct {
	cols        int
	rows        int
	pearls      int // default hoop pearl count (overridden by sculpted board popcount on square .1 fun levels)
	colorCount  int
	difficulty  int
	noBlockers  bool
	maxHearts   int
	maxRainbows int
	maxHidden   int
	maxLocked   int
	archetype   uint8
	squareFun   int // 0 = standard, 1..5 = square .1 fun breather slot (6x6, 7x7, 8x8 Std/Exp/Mst)
}

// 50-Level Sawtooth Wave Campaign Ladder (10 Tiers x 5 Levels per Theme = 200 Levels Total).
// Every size step resets colors down, strips tricky specials (keeping friendly Hearts per Option B),
// and drops logic difficulty sharply — while every Square .1 level (L11, L21, L36, L41, L46) is a
// joyful 3-color sculpted-shape breather board!
var campaignLadder = [LevelsPerChapter]tierTemplate{
	// Tier 1: 5x5 (L01-L05) — Warm-Up I & II (zero blockers) -> Hearts intro -> 5x5 Capstone
	{cols: 5, rows: 5, pearls: 14, colorCount: 3, difficulty: 0, noBlockers: true, maxHearts: 0, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeBlossom},
	{cols: 5, rows: 5, pearls: 16, colorCount: 3, difficulty: 0, noBlockers: true, maxHearts: 0, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeDiamond},
	{cols: 5, rows: 5, pearls: 19, colorCount: 4, difficulty: 1, noBlockers: false, maxHearts: 1, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHeart},
	{cols: 5, rows: 5, pearls: 21, colorCount: 4, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeStarburst},
	{cols: 5, rows: 5, pearls: 23, colorCount: 4, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeRoseWindow},

	// Tier 2: 6x5 (L06-L10) — Reset to 3c, Diff 1, Hearts only -> climb to 5c, Diff 5
	{cols: 6, rows: 5, pearls: 20, colorCount: 3, difficulty: 1, noBlockers: false, maxHearts: 1, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSunburst},
	{cols: 6, rows: 5, pearls: 22, colorCount: 4, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSpiral},
	{cols: 6, rows: 5, pearls: 24, colorCount: 4, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeButterfly},
	{cols: 6, rows: 5, pearls: 26, colorCount: 5, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeQuatrefoil},
	{cols: 6, rows: 5, pearls: 28, colorCount: 5, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHexGrid},

	// Tier 3: 6x6 (L11-L15) — Square .1 Sculpted Fun Breather (3c, Diff 1, Hearts) -> Rainbow intro at L13 -> Capstone
	{cols: 6, rows: 6, pearls: 22, colorCount: 3, difficulty: 1, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHeart, squareFun: 1},
	{cols: 6, rows: 6, pearls: 27, colorCount: 4, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeBlossom},
	{cols: 6, rows: 6, pearls: 29, colorCount: 5, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeStarburst},
	{cols: 6, rows: 6, pearls: 31, colorCount: 5, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeDiamond},
	{cols: 6, rows: 6, pearls: 34, colorCount: 5, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeRoseWindow},

	// Tier 4: 7x6 (L16-L20) — Reset to 4c, Diff 2, Hearts only -> Rainbow returns -> first 6-color Capstone
	{cols: 7, rows: 6, pearls: 28, colorCount: 4, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSpiral},
	{cols: 7, rows: 6, pearls: 32, colorCount: 4, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSunburst},
	{cols: 7, rows: 6, pearls: 35, colorCount: 5, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHexGrid},
	{cols: 7, rows: 6, pearls: 38, colorCount: 5, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeButterfly},
	{cols: 7, rows: 6, pearls: 40, colorCount: 6, difficulty: 6, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeQuatrefoil},

	// Tier 5: 7x7 (L21-L25) — Square .1 Sculpted Fun Breather (3c, Diff 2, Hearts) -> Hidden intro at L24 -> Capstone
	{cols: 7, rows: 7, pearls: 24, colorCount: 3, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeDiamond, squareFun: 2},
	{cols: 7, rows: 7, pearls: 38, colorCount: 5, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeBlossom},
	{cols: 7, rows: 7, pearls: 41, colorCount: 5, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeStarburst},
	{cols: 7, rows: 7, pearls: 44, colorCount: 6, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 2, maxLocked: 0, archetype: HoopShapeSpiral},
	{cols: 7, rows: 7, pearls: 47, colorCount: 6, difficulty: 6, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 0, archetype: HoopShapeRoseWindow},

	// Tier 6: 8x6 (L26-L30) — Reset to 4c, Diff 3, Hearts only -> layer Rainbow + Hidden -> Capstone
	{cols: 8, rows: 6, pearls: 34, colorCount: 4, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHexGrid},
	{cols: 8, rows: 6, pearls: 37, colorCount: 5, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHeart},
	{cols: 8, rows: 6, pearls: 40, colorCount: 5, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSunburst},
	{cols: 8, rows: 6, pearls: 43, colorCount: 6, difficulty: 6, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 2, maxLocked: 0, archetype: HoopShapeQuatrefoil},
	{cols: 8, rows: 6, pearls: 46, colorCount: 6, difficulty: 7, noBlockers: false, maxHearts: 3, maxRainbows: 1, maxHidden: 3, maxLocked: 0, archetype: HoopShapeDiamond},

	// Tier 7: 8x7 (L31-L35) — Reset to 4c, Diff 4, Hearts only -> Locked intro at L35 -> Capstone
	{cols: 8, rows: 7, pearls: 40, colorCount: 4, difficulty: 4, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeButterfly},
	{cols: 8, rows: 7, pearls: 44, colorCount: 5, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeBlossom},
	{cols: 8, rows: 7, pearls: 47, colorCount: 5, difficulty: 6, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSpiral},
	{cols: 8, rows: 7, pearls: 51, colorCount: 6, difficulty: 7, noBlockers: false, maxHearts: 2, maxRainbows: 1, maxHidden: 3, maxLocked: 0, archetype: HoopShapeStarburst},
	{cols: 8, rows: 7, pearls: 54, colorCount: 6, difficulty: 8, noBlockers: false, maxHearts: 3, maxRainbows: 1, maxHidden: 3, maxLocked: 1, archetype: HoopShapeRoseWindow},

	// Tier 8: 8x8 Standard (L36-L40) — Square .1 Sculpted Fun Breather (3c, Diff 2, Hearts) -> Full Suite Capstone
	{cols: 8, rows: 8, pearls: 32, colorCount: 3, difficulty: 2, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeStarburst, squareFun: 3},
	{cols: 8, rows: 8, pearls: 48, colorCount: 5, difficulty: 5, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHexGrid},
	{cols: 8, rows: 8, pearls: 52, colorCount: 5, difficulty: 6, noBlockers: false, maxHearts: 3, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSunburst},
	{cols: 8, rows: 8, pearls: 55, colorCount: 6, difficulty: 7, noBlockers: false, maxHearts: 3, maxRainbows: 1, maxHidden: 3, maxLocked: 1, archetype: HoopShapeQuatrefoil},
	{cols: 8, rows: 8, pearls: 58, colorCount: 6, difficulty: 8, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 3, maxLocked: 2, archetype: HoopShapeRoseWindow},

	// Tier 9: 8x8 Expert (L41-L45) — Square .1 Sculpted Fun Breather (3c, Diff 3, Hearts) -> Expert Capstone
	{cols: 8, rows: 8, pearls: 34, colorCount: 3, difficulty: 3, noBlockers: false, maxHearts: 2, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeButterfly, squareFun: 4},
	{cols: 8, rows: 8, pearls: 52, colorCount: 5, difficulty: 6, noBlockers: false, maxHearts: 3, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeDiamond},
	{cols: 8, rows: 8, pearls: 55, colorCount: 6, difficulty: 7, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 0, maxLocked: 0, archetype: HoopShapeSpiral},
	{cols: 8, rows: 8, pearls: 58, colorCount: 6, difficulty: 8, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 2, archetype: HoopShapeHeart},
	{cols: 8, rows: 8, pearls: 60, colorCount: 6, difficulty: 9, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 2, archetype: HoopShapeBlossom},

	// Tier 10: 8x8 Master (L46-L50) — Square .1 Sculpted Fun Breather (3c, Diff 3, Hearts) -> Grand 64/64 Masterpiece!
	{cols: 8, rows: 8, pearls: 32, colorCount: 3, difficulty: 3, noBlockers: false, maxHearts: 3, maxRainbows: 0, maxHidden: 0, maxLocked: 0, archetype: HoopShapeRoseWindow, squareFun: 5},
	{cols: 8, rows: 8, pearls: 55, colorCount: 5, difficulty: 8, noBlockers: false, maxHearts: 3, maxRainbows: 1, maxHidden: 0, maxLocked: 0, archetype: HoopShapeHexGrid},
	{cols: 8, rows: 8, pearls: 58, colorCount: 6, difficulty: 9, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 3, maxLocked: 1, archetype: HoopShapeStarburst},
	{cols: 8, rows: 8, pearls: 60, colorCount: 6, difficulty: 10, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 2, archetype: HoopShapeQuatrefoil},
	{cols: 8, rows: 8, pearls: 62, colorCount: 6, difficulty: 11, noBlockers: false, maxHearts: 3, maxRainbows: 2, maxHidden: 4, maxLocked: 3, archetype: HoopShapeRoseWindow},
}

// Sculpted fun board shapes per campaign for each of the 5 Square .1 slots (L11, L21, L36, L41, L46).
var campaignSquareFunShapes = [NumChapters][5]uint8{
	// 0: Jewel Atelier
	{BoardShapeHeart6, BoardShapeDiamond7, BoardShapeCrown8, BoardShapeButterfly8, BoardShapeInfinity8},
	// 1: Cyber Arcade
	{BoardShapeDigit6, BoardShapeDigit7, BoardShapeDigit8, BoardShapeInvader8, BoardShapeHeart8},
	// 2: Pop Studio
	{BoardShapeSmiley6, BoardShapeLetterP7, BoardShapeBolt8, BoardShapeStar8, BoardShapeHi8},
	// 3: Cathedral Glass
	{BoardShapeCross6, BoardShapeChalice7, BoardShapeArch8, BoardShapeWings8, BoardShapeRose8},
}

var campaignNames = [NumChapters][LevelsPerChapter]string{
	// Campaign 0: Jewel Atelier (50 unique artisan titles)
	{
		// T1 5x5
		"Sunbeam Brooch", "Dewdrop Ring", "Jewel Heart", "Amber Starlet", "Royal Locket",
		// T2 6x5
		"Golden Rays", "Pearl Nautilus", "Silk Moth", "Emerald Clover", "Honeycomb Pin",
		// T3 6x6
		"Sweetheart Gem", "Sakura Bloom", "Opal Starburst", "Faceted Drop", "Velvet Rosette",
		// T4 7x6
		"Gilded Vortex", "Sunburst Tiara", "Crystal Hive", "Monarch Crest", "Sapphire Clover",
		// T5 7x7
		"Carat Cut", "Peony Garland", "Crown Nova", "Gold Filigree", "Imperial Rose",
		// T6 8x6
		"Topaz Lattice", "Ruby Medallion", "Solstice Fan", "Jade Quatrefoil", "Marquise Prism",
		// T7 8x7
		"Swallowtail", "Orchid Wreath", "Nautilus Gold", "Starlight Crest", "Duchess Window",
		// T8 8x8 Standard
		"Jubilee Crown", "Beryl Matrix", "Radiant Brooch", "Clover Diadem", "Sovereign Rose",
		// T9 8x8 Expert
		"Monarch Flutter", "Diamond Pavé", "Celestial Coil", "Empress Heart", "Garden Crown",
		// T10 8x8 Master
		"Eternal Loop", "Emerald Vault", "Astral Tiara", "Regalia Crest", "Grand Jewel Rose",
	},
	// Campaign 1: Cyber Arcade (50 unique synthwave titles)
	{
		// T1 5x5
		"Neon Spark", "Bit Halo", "Pulse Core", "Pixel Star", "Arcade Ring",
		// T2 6x5
		"Laser Beam", "Turbo Spiral", "Cyber Wing", "Circuit Node", "Hex Buffer",
		// T3 6x6
		"Sector Six", "Synth Bloom", "Vector Nova", "Neon Diamond", "CRT Matrix",
		// T4 7x6
		"Warp Vortex", "Photon Array", "Data Hive", "Holo Drone", "Quad Bus",
		// T5 7x7
		"Lucky Seven", "Plasma Petal", "Hyper Star", "Ion Helix", "Mainframe Hub",
		// T6 8x6
		"Mesh Grid", "Power Heart", "Radar Sweep", "Logic Gate", "Prism Vector",
		// T7 8x7
		"Glitch Moth", "Volt Blossom", "Flux Coil", "Star Drive", "Cyber Portal",
		// T8 8x8 Standard
		"Byte Eight", "Hex Cluster", "Laser Burst", "Relay Cross", "Core Reactor",
		// T9 8x8 Expert
		"Arcade Sprite", "Synth Rhombus", "Overdrive Coil", "Neon Vitality", "Pulse Array",
		// T10 8x8 Master
		"Extra Life", "Quantum Grid", "Hypernova", "Omega Circuit", "Cyber Singularity",
	},
	// Campaign 2: Pop Studio (50 unique Warhol/comic titles)
	{
		// T1 5x5
		"Pop Dot", "Comic Ring", "Pop Heart", "Comic Star", "Studio Badge",
		// T2 6x5
		"Retro Sun", "Swirl Ink", "Pop Flutter", "Four-Color Pop", "Dot Matrix",
		// T3 6x6
		"Pop Smile", "Warhol Bloom", "Boom Burst", "Pop Diamond", "Gallery Ring",
		// T4 7x6
		"Vinyl Spin", "Pow Rays", "Halftone Hive", "Paper Wings", "Ink Clover",
		// T5 7x7
		"Pop Monogram", "Daisy Print", "Flash Star", "Groovy Spiral", "Poster Crown",
		// T6 8x6
		"Screen Mesh", "Crush Heart", "Sun Splash", "Mod Quatrefoil", "Kite Cut",
		// T7 8x7
		"Neon Monarch", "Flower Power", "Whirlpool Ink", "Zing Burst", "Mural Halo",
		// T8 8x8 Standard
		"Zap Flash", "Pixel Screen", "Super Splash", "Studio Cross", "Gallery Center",
		// T9 8x8 Expert
		"Supernova Pop", "Mod Diamond", "Hypno Swirl", "Big Love Pop", "Exhibition Bloom",
		// T10 8x8 Master
		"Pop Hello", "Color Grid", "Mega Boom", "Iconic Frame", "Grand Pop Burst",
	},
	// Campaign 3: Cathedral Glass (50 unique stained-glass titles)
	{
		// T1 5x5
		"Candle Shard", "Silver Lozenge", "Sacred Heart", "Vesper Star", "Cloister Halo",
		// T2 6x5
		"Morning Rays", "Incense Coil", "Dove Wings", "Abbey Clover", "Leadlight Hex",
		// T3 6x6
		"Chapel Cross", "Lily Lancet", "Aurora Star", "Prism Diamond", "Choir Rosette",
		// T4 7x6
		"Bell Spiral", "Solstice Nave", "Glass Lattice", "Cherub Crest", "Transept Arch",
		// T5 7x7
		"Golden Chalice", "Altar Blossom", "Benediction", "Scroll Helix", "North Window",
		// T6 8x6
		"Crystalline", "Rose Reliquary", "Sunlit Choir", "Gilded Trefoil", "Mitre Gem",
		// T7 8x7
		"Gabriel Wings", "Belfry Bloom", "Vesper Spiral", "Radiant Spire", "South Rose",
		// T8 8x8 Standard
		"Lantern Arch", "Vault Matrix", "Hymn Rays", "Apse Tracery", "Sapphire Nave",
		// T9 8x8 Expert
		"Seraph Wings", "Relic Prism", "Chalice Swirl", "Crimson Heart", "Cathedral Crown",
		// T10 8x8 Master
		"Sanctuary Rose", "Celestial Vault", "Archangel Star", "Dominion Cross", "Grand Rose Window",
	},
}

var campaignColorOrders = [NumChapters][NumColors]uint8{
	{ColorGold, ColorTurquoise, ColorRuby, ColorAmethyst, ColorEmerald, ColorCobalt},
	{ColorCobalt, ColorRuby, ColorEmerald, ColorGold, ColorAmethyst, ColorTurquoise},
	{ColorGold, ColorRuby, ColorCobalt, ColorAmethyst, ColorEmerald, ColorTurquoise},
	{ColorGold, ColorTurquoise, ColorRuby, ColorCobalt, ColorAmethyst, ColorEmerald},
}

// buildCampaignPattern constructs a crisp, theme-tailored hoop pattern for campaign 0..3 and level 0..49.
func buildCampaignPattern(campaignIdx, tierIdx int, tpl tierTemplate, boardShape uint8, pal []uint8) []StitchPoint {
	subPal := pal[:tpl.colorCount]

	// On square .1 fun breather levels, mirror the sculpted board shape right into the embroidery hoop!
	if boardShape != BoardShapeDefault {
		if pts := buildSculptedHoopFromBoard(boardShape, tpl.cols, tpl.rows, subPal); len(pts) > 0 {
			return pts
		}
	}

	// Per-campaign signature geometry twists so every world feels unmistakable!
	baseOffset := -math.Pi / 2
	petalAmp := 0.048
	freqShift := 0
	archShift := 0
	switch campaignIdx {
	case 0: // Jewel Atelier
		baseOffset = -math.Pi / 2
		petalAmp = 0.055
		freqShift = 0
		archShift = 0
	case 1: // Cyber Arcade
		baseOffset = math.Pi / 4
		petalAmp = 0.065
		freqShift = 1
		archShift = 2
	case 2: // Pop Studio
		baseOffset = -math.Pi/2 + math.Pi/10
		petalAmp = 0.072
		freqShift = 2
		archShift = 4
	case 3: // Cathedral Glass
		baseOffset = -math.Pi / 2
		petalAmp = 0.036
		freqShift = 0
		archShift = 6
	}

	// Keep L01/L02/L03 warmups & .5 Rose Window capstones locked to their iconic archetype,
	// while gently rotating middle levels per campaign so all 4 worlds have distinct silhouettes!
	arch := tpl.archetype
	if tierIdx >= 3 && (tierIdx%5) != 4 {
		arch = uint8((int(arch) + archShift) % 10)
	}
	rot := baseOffset + float64((tierIdx%5))*0.18
	return buildArchetypeStitches(arch, tpl.pearls, subPal, rot, petalAmp, freqShift+(tierIdx/5)%2)
}

// buildCuratedArtworks constructs 4 independent Day-1 Campaigns x 50 sawtooth levels = 200 levels!
func buildCuratedArtworks() []ArtworkDef {
	arts := make([]ArtworkDef, 0, NumChapters*LevelsPerChapter)
	for ch := 0; ch < NumChapters; ch++ {
		pal := campaignColorOrders[ch][:]
		for tIdx, tpl := range campaignLadder {
			var bShape uint8
			if tpl.squareFun > 0 && tpl.squareFun <= 5 {
				bShape = campaignSquareFunShapes[ch][tpl.squareFun-1]
			}
			seed := uint32((ch+1)*20000 + (tIdx+1)*193 + 47)
			st := buildCampaignPattern(ch, tIdx, tpl, bShape, pal)
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
				BoardShape:  bShape,
				Stitches:    st,
			})
		}
	}
	return arts
}

// CuratedArtworks holds all 200 progressive sawtooth campaign levels (4 Campaigns x 50 levels).
var CuratedArtworks = buildCuratedArtworks()
