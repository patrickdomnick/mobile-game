package sim

import "math"

// GenerateMandalaArtwork procedurally synthesizes a rich 3-layer symmetrical pearl mandala
// (30 to 44 pearls across 6x6 or 7x7 boards) from any seed.
func GenerateMandalaArtwork(seed uint32) ArtworkDef {
	rng := newPRNG(seed ^ 0x9E3779B9)

	symmetries := [4]int{5, 6, 7, 8}
	fold := symmetries[rng.intn(len(symmetries))]

	palette := [NumColors]uint8{0, 1, 2, 3, 4, 5}
	for i := NumColors - 1; i > 0; i-- {
		j := rng.intn(i + 1)
		palette[i], palette[j] = palette[j], palette[i]
	}

	stitches := make([]StitchPoint, 0, 46)

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

	// Layer 1: Mid ornate ring (2x fold up to 14 pearls)
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

	// Layer 2: Outer crown ring (2x fold up to 16 pearls)
	outerCount := fold * 2
	if outerCount > 16 {
		outerCount = 16
	}
	outerR := 0.77 + float64(rng.intn(5))*0.01
	outerOff := innerOff
	for k := 0; k < outerCount && len(stitches) < 44; k++ {
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
		cols, rows = 7, 7
	} else if len(stitches) > 30 {
		cols, rows = 6, 6
	}

	return ArtworkDef{
		ID:         int(seed & 0xFFFF),
		Name:       "Mandala",
		Cols:       cols,
		Rows:       rows,
		Difficulty: 4,
		Seed:       seed ^ 0xA5A55A5A,
		Stitches:   stitches,
	}
}
