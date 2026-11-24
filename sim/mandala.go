package sim

import "math"

// GenerateMandalaArtwork procedurally synthesizes a balanced radial symmetrical
// pearl embroidery mandala (4-, 5-, 6-, or 8-fold symmetry) from any seed.
func GenerateMandalaArtwork(seed uint32) ArtworkDef {
	rng := newPRNG(seed ^ 0x9E3779B9)

	symmetries := [4]int{4, 5, 6, 8}
	fold := symmetries[rng.intn(len(symmetries))]

	// Pick a harmonious 4- or 5-color palette subset from our 6 gem pearls
	palette := [NumColors]uint8{0, 1, 2, 3, 4, 5}
	for i := NumColors - 1; i > 0; i-- {
		j := rng.intn(i + 1)
		palette[i], palette[j] = palette[j], palette[i]
	}

	stitches := make([]StitchPoint, 0, 25)

	// Optional glowing center jewel pearl
	if fold != 8 {
		stitches = append(stitches, StitchPoint{
			X:     0,
			Z:     0,
			Color: palette[0],
		})
	}

	// Inner ring
	innerR := float64(0.32 + float32(rng.intn(8))*0.01)
	innerAngleOffset := float64(rng.intn(2)) * (math.Pi / float64(fold))
	for k := 0; k < fold; k++ {
		ang := innerAngleOffset + float64(k)*(2.0*math.Pi/float64(fold))
		col := palette[1]
		if fold%2 == 0 && k%2 == 1 {
			col = palette[2]
		}
		stitches = append(stitches, StitchPoint{
			X:     float32(math.Cos(ang) * innerR),
			Z:     float32(math.Sin(ang) * innerR),
			Color: col,
		})
	}

	// Outer ring (possibly 2x petals for 4-fold or 5-fold to land nicely in 16..24 pearls)
	outerCount := fold
	if fold <= 5 && len(stitches)+fold*2 <= 25 {
		outerCount = fold * 2
	} else if fold == 6 && len(stitches)+12 <= 25 {
		outerCount = 12
	}

	outerR := float64(0.66 + float32(rng.intn(9))*0.01)
	outerOffset := innerAngleOffset + math.Pi/float64(outerCount)
	for k := 0; k < outerCount && len(stitches) < 25; k++ {
		ang := outerOffset + float64(k)*(2.0*math.Pi/float64(outerCount))
		col := palette[2]
		if k%2 == 1 {
			col = palette[3]
		}
		// Gentle alternating scallop radius on 2x outer rings
		r := outerR
		if outerCount > fold && k%2 == 1 {
			r -= 0.11
		}
		stitches = append(stitches, StitchPoint{
			X:     float32(math.Cos(ang) * r),
			Z:     float32(math.Sin(ang) * r),
			Color: col,
		})
	}

	// Add a secondary mid accent ring if 4-fold or 8-fold has room
	if len(stitches)+fold <= 24 {
		midR := 0.50
		for k := 0; k < fold; k++ {
			ang := innerAngleOffset + float64(k)*(2.0*math.Pi/float64(fold))
			stitches = append(stitches, StitchPoint{
				X:     float32(math.Cos(ang) * midR),
				Z:     float32(math.Sin(ang) * midR),
				Color: palette[4],
			})
		}
	}

	cols, rows := 4, 4
	if len(stitches) > 20 {
		cols, rows = 5, 5
	} else if len(stitches) > 16 {
		cols, rows = 5, 4
	}

	return ArtworkDef{
		ID:         int(seed & 0xFFFF),
		Name:       "Mandala",
		Cols:       cols,
		Rows:       rows,
		Difficulty: 3,
		Seed:       seed ^ 0xA5A55A5A,
		Stitches:   stitches,
	}
}
