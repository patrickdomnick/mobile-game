package sim

import "math"

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

// GenerateMandalaArtwork procedurally synthesizes a rich, unique 3-layer pearl pattern
// purely from any uint32 seed across 5 distinct geometric archetypes (22-38 pearls on 5x5..7x6).
// Used for both Endless Mode (random or custom user seed) and Daily Stitch (YYYYMMDD date seed).
func GenerateMandalaArtwork(seed uint32, theme int) ArtworkDef {
	if seed == 0 {
		seed = 1
	}
	// Mix seed with avalanche hash so adjacent seeds (e.g. 100001 vs 100002 or consecutive dates)
	// produce completely distinct archetypes, symmetries, palettes, and boards!
	mixed := seed ^ 0x9E3779B9
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
	colorCount := 4 + rng.intn(3) // 4, 5, or 6 distinct colors
	palAt := func(idx int) uint8 {
		return palette[idx%colorCount]
	}

	archetype := rng.intn(5)
	stitches := make([]StitchPoint, 0, 40)

	switch archetype {
	case 0:
		// Archetype 0: Layered Petal Blossom (5..8-fold radial mandala)
		fold := 5 + rng.intn(4)
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		innerR := 0.25 + float64(rng.intn(5))*0.01
		innerOff := float64(rng.intn(4)) * (math.Pi / float64(fold*2))
		for k := 0; k < fold; k++ {
			ang := innerOff + float64(k)*(2.0*math.Pi/float64(fold))
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * innerR), Z: float32(math.Sin(ang) * innerR),
				Color: palAt(1 + k%2), Layer: 0,
			})
		}
		midCount := fold * 2
		if midCount > 14 {
			midCount = fold
		}
		midR := 0.51 + float64(rng.intn(4))*0.01
		midOff := innerOff + math.Pi/float64(midCount)
		for k := 0; k < midCount; k++ {
			ang := midOff + float64(k)*(2.0*math.Pi/float64(midCount))
			r := midR
			if k%2 == 1 {
				r -= 0.07
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: palAt(2 + k%2), Layer: 1,
			})
		}
		outerCount := fold * 2
		if outerCount > 16 {
			outerCount = 16
		}
		outerR := 0.78 + float64(rng.intn(4))*0.01
		for k := 0; k < outerCount && len(stitches) < 38; k++ {
			ang := innerOff + float64(k)*(2.0*math.Pi/float64(outerCount))
			r := outerR
			if k%2 == 1 {
				r -= 0.09
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: palAt(4 + k%2), Layer: 2,
			})
		}

	case 1:
		// Archetype 1: Starburst Crown (5..8 pointed star core + sparkling outer halo)
		pts := 5 + rng.intn(4)
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		rot := -math.Pi/2 + float64(rng.intn(2))*(math.Pi/float64(pts))
		for k := 0; k < pts*2; k++ {
			ang := rot + float64(k)*(math.Pi/float64(pts))
			r := 0.44
			c := palAt(1)
			layer := uint8(0)
			if k%2 == 1 {
				r = 0.24
				c = palAt(2)
			} else {
				layer = 1
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: c, Layer: layer,
			})
		}
		outerN := pts * 2
		if outerN > 16 {
			outerN = 16
		}
		for k := 0; k < outerN && len(stitches) < 38; k++ {
			ang := rot + float64(k)*(2.0*math.Pi/float64(outerN))
			r := 0.78
			if k%2 == 1 {
				r = 0.65
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: palAt(3 + k%3), Layer: 2,
			})
		}

	case 2:
		// Archetype 2: Golden Vortex Spiral (multi-arm radiant swirl)
		total := 26 + rng.intn(11) // 26..36 pearls
		turns := 1.8 + float64(rng.intn(8))*0.15
		rotOff := float64(rng.intn(12)) * (math.Pi / 6.0)
		dir := 1.0
		if rng.intn(2) == 1 {
			dir = -1.0
		}
		for i := 0; i < total; i++ {
			t := float64(i) / float64(total-1)
			r := 0.08 + 0.74*math.Sqrt(t)
			ang := rotOff + dir*t*turns*2.0*math.Pi
			layer := uint8(0)
			if r > 0.58 {
				layer = 2
			} else if r > 0.34 {
				layer = 1
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: palAt(i % colorCount), Layer: layer,
			})
		}

	case 3:
		// Archetype 3: Sacred Crystal Lattice (diamond & octagon jewel facets)
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		rot := float64(rng.intn(2)) * (math.Pi / 4.0)
		// Inner 4-point diamond
		for k := 0; k < 4; k++ {
			ang := rot + float64(k)*(math.Pi/2.0)
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * 0.26), Z: float32(math.Sin(ang) * 0.26),
				Color: palAt(1), Layer: 0,
			})
		}
		// Mid 8-point crystal octagon
		for k := 0; k < 8; k++ {
			ang := rot + float64(k)*(math.Pi/4.0)
			r := 0.54
			if k%2 == 1 {
				r = 0.44
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: palAt(2 + k%2), Layer: 1,
			})
		}
		// Outer 16-point faceted crown
		outerN := 12 + rng.intn(2)*4 // 12 or 16
		for k := 0; k < outerN; k++ {
			ang := rot + float64(k)*(2.0*math.Pi/float64(outerN))
			r := 0.80
			if k%2 == 1 {
				r = 0.70
			}
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * r), Z: float32(math.Sin(ang) * r),
				Color: palAt(3 + k%3), Layer: 2,
			})
		}

	default:
		// Archetype 4: Orbital Constellation (radiant sun core + 4..6 satellite flower clusters!)
		orbits := 4 + rng.intn(3) // 4, 5, or 6 satellite clusters
		stitches = append(stitches, StitchPoint{X: 0, Z: 0, Color: palAt(0), Layer: 0})
		for k := 0; k < orbits; k++ {
			ang := float64(k) * (2.0 * math.Pi / float64(orbits))
			stitches = append(stitches, StitchPoint{
				X: float32(math.Cos(ang) * 0.24), Z: float32(math.Sin(ang) * 0.24),
				Color: palAt(1), Layer: 0,
			})
		}
		rot := math.Pi / float64(orbits)
		for k := 0; k < orbits; k++ {
			baseAng := rot + float64(k)*(2.0*math.Pi/float64(orbits))
			cx := math.Cos(baseAng) * 0.62
			cz := math.Sin(baseAng) * 0.62
			// Cluster center
			stitches = append(stitches, StitchPoint{
				X: float32(cx), Z: float32(cz),
				Color: palAt(2), Layer: 1,
			})
			// 3 satellite pearls around each cluster center
			for s := 0; s < 3 && len(stitches) < 38; s++ {
				sa := baseAng + float64(s-1)*1.05
				px := cx + math.Cos(sa)*0.17
				pz := cz + math.Sin(sa)*0.17
				stitches = append(stitches, StitchPoint{
					X: float32(px), Z: float32(pz),
					Color: palAt(3 + s), Layer: 2,
				})
			}
		}
	}

	// Pick snug grid dimensions matching procedural pearl count
	cols, rows := 6, 5
	switch {
	case len(stitches) <= 25:
		cols, rows = 5, 5
	case len(stitches) <= 30:
		cols, rows = 6, 5
	case len(stitches) <= 36:
		cols, rows = 6, 6
	default:
		cols, rows = 7, 6
	}

	diff := 2 + rng.intn(3) // 2..4 engaging difficulty

	return ArtworkDef{
		ID:         int(seed & 0xFFFF),
		Chapter:    theme,
		Theme:      theme,
		Name:       "Seed Mandala",
		Cols:       cols,
		Rows:       rows,
		Difficulty: diff,
		Seed:       mixed ^ 0xA5A55A5A,
		Stitches:   stitches,
	}
}
