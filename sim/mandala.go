package sim

import "math"

// ThemeForDaily deterministically rotates the Daily Stitch visual theme by calendar date (YYYYMMDD)
// so today might be Cyber Neon, tomorrow Jewel Atelier, the next day Noir Salon, etc.
func ThemeForDaily(dateKey uint32) int {
	h := dateKey ^ 0x5A17C3D1
	h ^= h >> 15
	h *= 0x85EBCA6B
	h ^= h >> 13
	return int(h % NumThemes)
}

// ThemeForMandala deterministically varies the visual theme across Endless Mandala seeds.
func ThemeForMandala(seed uint32) int {
	h := (seed + 1) * 2654435761
	h ^= h >> 16
	return int(h % NumThemes)
}

// GenerateMandalaArtwork procedurally synthesizes a 3-layer symmetrical pearl mandala
// matched to the given native visual theme. When Noir B&W is rolled, it automatically
// uses calmer board size (19-25 pearls) and strictly 3-4 distinct geometric B&W types!
func GenerateMandalaArtwork(seed uint32, theme int) ArtworkDef {
	rng := newPRNG(seed ^ 0x9E3779B9)
	if theme < 0 || theme >= NumThemes {
		theme = ThemeJewelAtelier
	}

	if theme == ThemeNoirBW {
		// Noir Salon mandala: crisp, calmer 5x5 Art-Deco monochrome using ONLY 4 geometric types (0..3)
		noirTypes := [4]uint8{0, 1, 2, 3}
		for i := 3; i > 0; i-- {
			j := rng.intn(i + 1)
			noirTypes[i], noirTypes[j] = noirTypes[j], noirTypes[i]
		}
		fold := 4 + rng.intn(3) // 4, 5, or 6 symmetry
		stitches := make([]StitchPoint, 0, 26)
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: noirTypes[0], Layer: 0})
		innerOff := float64(rng.intn(2)) * (math.Pi / float64(fold))
		for k := 0; k < fold; k++ {
			ang := innerOff + float64(k)*(2.0*math.Pi/float64(fold))
			col := noirTypes[1]
			if k%2 == 1 {
				col = noirTypes[2]
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * 0.28), Z: float32(math.Sin(ang) * 0.28), Color: col, Layer: 0,
			})
		}
		midCount := fold * 2
		if midCount > 10 {
			midCount = 8
		}
		for k := 0; k < midCount; k++ {
			ang := innerOff + math.Pi/float64(midCount) + float64(k)*(2.0*math.Pi/float64(midCount))
			col := noirTypes[2]
			if k%2 == 1 {
				col = noirTypes[3]
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * 0.54), Z: float32(math.Sin(ang) * 0.54), Color: col, Layer: 1,
			})
		}
		outerCount := 24 - len(stitches)
		if outerCount < 6 {
			outerCount = 6
		}
		for k := 0; k < outerCount && len(stitches) < 25; k++ {
			ang := innerOff + float64(k)*(2.0*math.Pi/float64(outerCount))
			col := noirTypes[0]
			if k%2 == 1 {
				col = noirTypes[1]
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * 0.78), Z: float32(math.Sin(ang) * 0.78), Color: col, Layer: 2,
			})
		}
		return ArtworkDef{
			ID:         int(seed & 0xFFFF),
			Chapter:    1,
			Theme:      ThemeNoirBW,
			Name:       "Noir Mandala",
			Cols:       5,
			Rows:       5,
			Difficulty: 2,
			Seed:       seed ^ 0xA5A55A5A,
			Stitches:   stitches,
		}
	}

	// Rich color themes (Jewel, Neon, Pop Art, Stained Glass): 28-40 pearls on 6x6 / 7x6
	symmetries := [4]int{5, 6, 7, 8}
	fold := symmetries[rng.intn(len(symmetries))]

	palette := [NumColors]uint8{0, 1, 2, 3, 4, 5}
	for i := NumColors - 1; i > 0; i-- {
		j := rng.intn(i + 1)
		palette[i], palette[j] = palette[j], palette[i]
	}

	stitches := make([]StitchPoint, 0, 42)

	// Layer 0: Center jewel + inner petal ring
	stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palette[0], Layer: 0})
	innerR := 0.25 + float64(rng.intn(5))*0.01
	innerOff := float64(rng.intn(2)) * (math.Pi / float64(fold))
	for k := 0; k < fold; k++ {
		ang := innerOff + float64(k)*(2.0*math.Pi/float64(fold))
		col := palette[1]
		if k%2 == 1 {
			col = palette[2]
		}
		stitches = append(stitches, StitchPoint{
			X:     float32(math.Cos(ang) * innerR),
			Z:     float32(math.Sin(ang) * innerR),
			Color: col,
			Layer: 0,
		})
	}

	// Layer 1: Mid ornate ring
	midCount := fold * 2
	if midCount > 14 {
		midCount = fold
	}
	midR := 0.50 + float64(rng.intn(5))*0.01
	midOff := innerOff + math.Pi/float64(midCount)
	for k := 0; k < midCount; k++ {
		ang := midOff + float64(k)*(2.0*math.Pi/float64(midCount))
		r := midR
		if k%2 == 1 {
			r -= 0.06
		}
		col := palette[2]
		if k%2 == 1 {
			col = palette[3]
		}
		stitches = append(stitches, StitchPoint{
			X:     float32(math.Cos(ang) * r),
			Z:     float32(math.Sin(ang) * r),
			Color: col,
			Layer: 1,
		})
	}

	// Layer 2: Outer crown ring
	outerCount := fold * 2
	if outerCount > 16 {
		outerCount = 16
	}
	outerR := 0.77 + float64(rng.intn(5))*0.01
	outerOff := innerOff
	for k := 0; k < outerCount && len(stitches) < 40; k++ {
		ang := outerOff + float64(k)*(2.0*math.Pi/float64(outerCount))
		r := outerR
		if k%2 == 1 {
			r -= 0.08
		}
		col := palette[4]
		if k%2 == 1 {
			col = palette[5]
		}
		stitches = append(stitches, StitchPoint{
			X:     float32(math.Cos(ang) * r),
			Z:     float32(math.Sin(ang) * r),
			Color: col,
			Layer: 2,
		})
	}

	cols, rows := 6, 6
	if len(stitches) > 36 {
		cols, rows = 7, 6
	}

	return ArtworkDef{
		ID:         int(seed & 0xFFFF),
		Chapter:    0,
		Theme:      theme,
		Name:       "Mandala",
		Cols:       cols,
		Rows:       rows,
		Difficulty: 3,
		Seed:       seed ^ 0xA5A55A5A,
		Stitches:   stitches,
	}
}
