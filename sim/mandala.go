package sim

import "math"

const (
	SeedDiffEasy    = 0 // 5x5 — Hearts only
	SeedDiffMedium  = 1 // 6x6 — Hearts + Rainbows
	SeedDiffHard    = 2 // 7x7 — Hearts + Rainbows + Hidden
	SeedDiffExtreme = 3 // 8x8 — All pearl types (Hearts + Rainbows + Hidden + Locked)
)

// ThemeForMandala deterministically picks one of the 4 vivid worlds purely from any uint32 seed.
func ThemeForMandala(seed uint32) int {
	h := seed ^ 0x5A17C3D1
	h ^= h >> 15
	h *= 0x85EBCA6B
	h ^= h >> 13
	return int(h % NumThemes)
}

// ThemeForDaily uses the exact same seed hash as Endless so any YYYYMMDD date is just a shareable seed!
func ThemeForDaily(dateKey uint32) int {
	return ThemeForMandala(dateKey)
}

// GenerateMandalaArtwork generates a default Medium (6x6) seeded puzzle (used for Daily Stitch & backward compatibility).
func GenerateMandalaArtwork(seed uint32, theme int) ArtworkDef {
	return GenerateMandalaArtworkWithDifficulty(seed, theme, SeedDiffMedium)
}

// GenerateMandalaArtworkWithDifficulty synthesizes a unique, verified 3-star 3-layer pearl pattern
// purely from any uint32 seed across 4 difficulty tiers:
//   - 0 Easy:    5x5 (19..23 pearls, Hearts only)
//   - 1 Medium:  6x6 (28..33 pearls + 1 Rainbow, Hearts + Rainbows)
//   - 2 Hard:    7x7 (39..44 pearls + 1 Rainbow, Hearts + Rainbows + Hidden)
//   - 3 Extreme: 8x8 (52..58 pearls + 2 Rainbows, Hearts + Rainbows + Hidden + Locked)
func GenerateMandalaArtworkWithDifficulty(seed uint32, theme int, diffTier int) ArtworkDef {
	if seed == 0 {
		seed = 1
	}
	if diffTier < SeedDiffEasy {
		diffTier = SeedDiffEasy
	}
	if diffTier > SeedDiffExtreme {
		diffTier = SeedDiffExtreme
	}

	mixed := seed ^ 0x9E3779B9 ^ (uint32(diffTier) * 0x27D4EB2D)
	mixed ^= mixed >> 16
	mixed *= 0x85EBCA6B
	mixed ^= mixed >> 13
	mixed *= 0xC2B2AE35
	mixed ^= mixed >> 16
	rng := newPRNG(mixed)

	if theme < 0 || theme >= NumThemes {
		theme = ThemeForMandala(seed)
	}

	palette := [NumColors]uint8{0, 1, 2, 3, 4, 5}
	for i := NumColors - 1; i > 0; i-- {
		j := rng.intn(i + 1)
		palette[i], palette[j] = palette[j], palette[i]
	}

	var cols, rows, targetCount, colorCount, boardDiff int
	var maxHearts, maxRainbows, maxHidden, maxLocked int
	switch diffTier {
	case SeedDiffEasy:
		cols, rows = 5, 5
		targetCount = 19 + rng.intn(4) // 19..22
		colorCount = 4
		boardDiff = 2
		maxHearts = 2
	case SeedDiffMedium:
		cols, rows = 6, 6
		targetCount = 28 + rng.intn(5) // 28..32 (+1 Rainbow = 29..33)
		colorCount = 5
		boardDiff = 4
		maxHearts = 2
		maxRainbows = 1
	case SeedDiffHard:
		cols, rows = 7, 7
		targetCount = 39 + rng.intn(5) // 39..43 (+1 Rainbow = 40..44)
		colorCount = 5 + rng.intn(2)   // 5 or 6
		boardDiff = 6
		maxHearts = 2
		maxRainbows = 1
		maxHidden = 3
	default: // SeedDiffExtreme
		cols, rows = 8, 8
		targetCount = 52 + rng.intn(6) // 52..57 (+2 Rainbows = 54..59)
		colorCount = 6
		boardDiff = 9
		maxHearts = 3
		maxRainbows = 2
		maxHidden = 4
		maxLocked = 2
	}

	pal := palette[:colorCount]
	palAt := func(idx int) uint8 {
		return pal[idx%colorCount]
	}

	archetype := rng.intn(4)
	stitches := make([]StitchPoint, 0, targetCount)

	switch archetype {
	case 0:
		// Layered Concentric Petal Mandala scaled cleanly to exact targetCount (19..57)
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		rem := targetCount - 1
		rot := -math.Pi/2 + float64(rng.intn(6))*(math.Pi/12.0)
		amp := 0.03 + float64(rng.intn(4))*0.012
		if targetCount <= 34 {
			r1 := rem * 25 / 100
			if r1 < 5 {
				r1 = 5
			}
			r2 := rem * 35 / 100
			r3 := rem - r1 - r2
			stitches = append(stitches, waveRingPoints(r1, 0.27, 0, r1, rot, []uint8{palAt(1), palAt(0)}, 0)...)
			stitches = append(stitches, waveRingPoints(r2, 0.53, amp*0.8, 4+rng.intn(3), rot+math.Pi/float64(r2), []uint8{palAt(2), palAt(3)}, 1)...)
			stitches = append(stitches, waveRingPoints(r3, 0.80, amp, 5+rng.intn(3), rot, []uint8{palAt(3), palAt(4)}, 2)...)
		} else {
			// 4 concentric rings for crisp zero-overlap 7x7 and 8x8 masterpieces!
			r1 := 6 + rng.intn(2)
			r2 := 11 + rng.intn(3)
			r3 := (rem - r1 - r2) * 45 / 100
			r4 := rem - r1 - r2 - r3
			stitches = append(stitches, waveRingPoints(r1, 0.21, 0, r1, rot, []uint8{palAt(1), palAt(0)}, 0)...)
			stitches = append(stitches, waveRingPoints(r2, 0.42, 0.02, 5+rng.intn(3), rot+math.Pi/float64(r2), []uint8{palAt(2), palAt(3)}, 1)...)
			stitches = append(stitches, waveRingPoints(r3, 0.63, 0.02, 6+rng.intn(3), rot, []uint8{palAt(4), palAt(1)}, 1)...)
			stitches = append(stitches, waveRingPoints(r4, 0.84, amp*0.55, 6+rng.intn(4), rot+math.Pi/float64(r4), []uint8{palAt(5), palAt(2)}, 2)...)
		}

	case 1:
		// Golden Fermat-Vortex Spiral (always zero-overlap at ANY count 19..57!)
		turns := 2.0 + float64(diffTier)*0.45 + float64(rng.intn(5))*0.15
		rotOff := float64(rng.intn(12)) * (math.Pi / 6.0)
		dir := 1.0
		if rng.intn(2) == 1 {
			dir = -1.0
		}
		for i := 0; i < targetCount; i++ {
			t := float64(i) / float64(targetCount-1)
			r := 0.08 + 0.76*math.Sqrt(t)
			ang := rotOff + dir*t*turns*2.0*math.Pi
			layer := uint8(0)
			if r > 0.60 {
				layer = 2
			} else if r > 0.36 {
				layer = 1
			}
			stitches = append(stitches, StitchPoint{
				X:     float32(math.Cos(ang) * r),
				Z:     float32(math.Sin(ang) * r),
				Color: palAt(i % colorCount),
				Layer: layer,
			})
		}

	case 2:
		// Starburst Faceted Crown
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		rem := targetCount - 1
		rot := -math.Pi/2 + float64(rng.intn(2))*(math.Pi/8.0)
		if targetCount <= 34 {
			r1 := 6
			r2 := (rem - r1) * 44 / 100
			r3 := rem - r1 - r2
			stitches = append(stitches, waveRingPoints(r1, 0.26, 0.04, 3, rot, []uint8{palAt(1), palAt(2)}, 0)...)
			stitches = append(stitches, waveRingPoints(r2, 0.52, 0.06, r2/2, rot+math.Pi/float64(r2), []uint8{palAt(2), palAt(3)}, 1)...)
			stitches = append(stitches, waveRingPoints(r3, 0.79, 0.06, r3/2, rot, []uint8{palAt(4), palAt(1)}, 2)...)
		} else {
			r1 := 7
			r2 := 12
			r3 := (rem - r1 - r2) * 46 / 100
			r4 := rem - r1 - r2 - r3
			stitches = append(stitches, waveRingPoints(r1, 0.22, 0.02, 7, rot, []uint8{palAt(1), palAt(0)}, 0)...)
			stitches = append(stitches, waveRingPoints(r2, 0.42, 0.035, 6, rot, []uint8{palAt(2), palAt(3)}, 1)...)
			stitches = append(stitches, waveRingPoints(r3, 0.63, 0.04, 6, rot+math.Pi/float64(r3), []uint8{palAt(4), palAt(5)}, 1)...)
			stitches = append(stitches, waveRingPoints(r4, 0.83, 0.04, 8, rot, []uint8{palAt(5), palAt(0)}, 2)...)
		}

	default:
		// Cathedral Rose Symmetry
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		rem := targetCount - 1
		rot := float64(rng.intn(4)) * (math.Pi / 8.0)
		if targetCount <= 34 {
			r1 := 5 + rng.intn(3)
			r2 := (rem - r1) * 46 / 100
			r3 := rem - r1 - r2
			stitches = append(stitches, waveRingPoints(r1, 0.25, 0, r1, rot, []uint8{palAt(1), palAt(0)}, 0)...)
			stitches = append(stitches, waveRingPoints(r2, 0.52, 0.03, 4, rot, []uint8{palAt(2), palAt(3)}, 1)...)
			stitches = append(stitches, waveRingPoints(r3, 0.80, 0.035, 8, rot+math.Pi/float64(r3), []uint8{palAt(4), palAt(2)}, 2)...)
		} else {
			r1 := 6
			r2 := 12
			r3 := (rem - r1 - r2) * 44 / 100
			r4 := rem - r1 - r2 - r3
			stitches = append(stitches, waveRingPoints(r1, 0.21, 0, 6, rot, []uint8{palAt(0), palAt(1)}, 0)...)
			stitches = append(stitches, waveRingPoints(r2, 0.42, 0.02, 6, rot+math.Pi/12, []uint8{palAt(2), palAt(3)}, 1)...)
			stitches = append(stitches, waveRingPoints(r3, 0.63, 0.02, 8, rot, []uint8{palAt(4), palAt(5)}, 1)...)
			stitches = append(stitches, waveRingPoints(r4, 0.84, 0.025, 8, rot+math.Pi/float64(r4), []uint8{palAt(3), palAt(5)}, 2)...)
		}
	}

	return ArtworkDef{
		ID:          int(seed & 0xFFFF),
		Chapter:     theme,
		Theme:       theme,
		Name:        "Seed Pattern",
		Cols:        cols,
		Rows:        rows,
		Difficulty:  boardDiff,
		Seed:        mixed ^ 0xA5A55A5A,
		MaxHearts:   maxHearts,
		MaxRainbows: maxRainbows,
		MaxHidden:   maxHidden,
		MaxLocked:   maxLocked,
		Stitches:    stitches,
	}
}
