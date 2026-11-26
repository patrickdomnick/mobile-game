package sim

import "math"

// Sculpted playable board shapes for Square .1 Fun Breather levels (0 = default centered cluster).
const (
	BoardShapeDefault    uint8 = 0
	BoardShapeHeart6     uint8 = 1  // 6x6 Jewel Atelier: Sweetheart Gem (22 tiles)
	BoardShapeDigit6     uint8 = 2  // 6x6 Cyber Arcade: Sector Six "6" (23 tiles)
	BoardShapeSmiley6    uint8 = 3  // 6x6 Pop Studio: Pop Smile (18 tiles)
	BoardShapeCross6     uint8 = 4  // 6x6 Cathedral Glass: Chapel Cross (20 tiles)
	BoardShapeDiamond7   uint8 = 5  // 7x7 Jewel Atelier: Carat Cut Diamond (25 tiles)
	BoardShapeDigit7     uint8 = 6  // 7x7 Cyber Arcade: Lucky Seven "7" (21 tiles)
	BoardShapeLetterP7   uint8 = 7  // 7x7 Pop Studio: Pop Monogram "P" (24 tiles)
	BoardShapeChalice7   uint8 = 8  // 7x7 Cathedral Glass: Golden Chalice (23 tiles)
	BoardShapeCrown8     uint8 = 9  // 8x8 Jewel Atelier: Jubilee Crown (32 tiles)
	BoardShapeDigit8     uint8 = 10 // 8x8 Cyber Arcade: Byte Eight "8" (34 tiles)
	BoardShapeBolt8      uint8 = 11 // 8x8 Pop Studio: Zap Flash Lightning (28 tiles)
	BoardShapeArch8      uint8 = 12 // 8x8 Cathedral Glass: Lantern Arch (34 tiles)
	BoardShapeButterfly8 uint8 = 13 // 8x8 Jewel Atelier: Monarch Flutter (34 tiles)
	BoardShapeInvader8   uint8 = 14 // 8x8 Cyber Arcade: Arcade Sprite (34 tiles)
	BoardShapeStar8      uint8 = 15 // 8x8 Pop Studio: Supernova Pop Star (34 tiles)
	BoardShapeWings8     uint8 = 16 // 8x8 Cathedral Glass: Seraph Wings (36 tiles)
	BoardShapeInfinity8  uint8 = 17 // 8x8 Jewel Atelier: Eternal Loop "∞" (28 tiles)
	BoardShapeHeart8     uint8 = 18 // 8x8 Cyber Arcade: Extra Life Heart (40 tiles)
	BoardShapeHi8        uint8 = 19 // 8x8 Pop Studio: Pop Hello "HI" (26 tiles)
	BoardShapeRose8      uint8 = 20 // 8x8 Cathedral Glass: Sanctuary Rose (32 tiles)
)

// Hoop embroidery silhouette archetypes (10 distinct artistic forms).
const (
	HoopShapeBlossom    uint8 = 0
	HoopShapeStarburst  uint8 = 1
	HoopShapeHeart      uint8 = 2
	HoopShapeSpiral     uint8 = 3
	HoopShapeDiamond    uint8 = 4
	HoopShapeQuatrefoil uint8 = 5
	HoopShapeSunburst   uint8 = 6
	HoopShapeButterfly  uint8 = 7
	HoopShapeHexGrid    uint8 = 8
	HoopShapeRoseWindow uint8 = 9
)

type gridCell struct {
	c int
	r int
}

var sculptedBoardPatterns = map[uint8][]string{
	BoardShapeHeart6: {
		".XX.XX",
		"XXXXXX",
		"XXXXXX",
		".XXXX.",
		"..XX..",
		"......",
	},
	BoardShapeDigit6: {
		".XXXX.",
		"XX....",
		"XXXXX.",
		"XX..XX",
		"XX..XX",
		".XXXX.",
	},
	BoardShapeSmiley6: {
		"XX..XX",
		"XX..XX",
		"......",
		"X....X",
		"XX..XX",
		".XXXX.",
	},
	BoardShapeCross6: {
		"..XX..",
		"..XX..",
		"XXXXXX",
		"XXXXXX",
		"..XX..",
		"..XX..",
	},
	BoardShapeDiamond7: {
		"...X...",
		"..XXX..",
		".XXXXX.",
		"XXXXXXX",
		".XXXXX.",
		"..XXX..",
		"...X...",
	},
	BoardShapeDigit7: {
		"XXXXXXX",
		"XX...XX",
		"....XX.",
		"...XX..",
		"..XX...",
		"..XX...",
		"..XX...",
	},
	BoardShapeLetterP7: {
		".XXXXX.",
		".XX..XX",
		".XX..XX",
		".XXXXX.",
		".XX....",
		".XX....",
		".XX....",
	},
	BoardShapeChalice7: {
		".XXXXX.",
		".XXXXX.",
		"..XXX..",
		"...X...",
		"...X...",
		"..XXX..",
		".XXXXX.",
	},
	BoardShapeCrown8: {
		"........",
		"X..XX..X",
		"X.XXXX.X",
		"XXXXXXXX",
		"XXXXXXXX",
		".XXXXXX.",
		"........",
		"........",
	},
	BoardShapeDigit8: {
		".XXXXXX.",
		"XX....XX",
		"XX....XX",
		".XXXXXX.",
		"XX....XX",
		"XX....XX",
		".XXXXXX.",
		"........",
	},
	BoardShapeBolt8: {
		"....XXX.",
		"...XXX..",
		"..XXX...",
		".XXXXXX.",
		"..XXXXX.",
		"...XXX..",
		"..XXX...",
		".XX.....",
	},
	BoardShapeArch8: {
		"...XX...",
		"..XXXX..",
		".XX..XX.",
		"XX....XX",
		"XX.XX.XX",
		"XX....XX",
		"XX....XX",
		".XXXXXX.",
	},
	BoardShapeButterfly8: {
		".X....X.",
		"XXX..XXX",
		"XXXXXXXX",
		".XXXXXX.",
		"..XXXX..",
		".XX..XX.",
		"XX....XX",
		"........",
	},
	BoardShapeInvader8: {
		"..X..X..",
		".XXXXXX.",
		"XX.XX.XX",
		"XXXXXXXX",
		"X.XXXX.X",
		"X.X..X.X",
		"..X..X..",
		"........",
	},
	BoardShapeStar8: {
		"...XX...",
		"...XX...",
		".XXXXXX.",
		"XXXXXXXX",
		".XXXXXX.",
		"..XXXX..",
		".XX..XX.",
		"X......X",
	},
	BoardShapeWings8: {
		"XXX..XXX",
		"XXXXXXXX",
		"XXX..XXX",
		"XX.XX.XX",
		".X.XX.X.",
		"..XXXX..",
		"...XX...",
		"........",
	},
	BoardShapeInfinity8: {
		"........",
		".XX..XX.",
		"XX.XX.XX",
		"X..XX..X",
		"X..XX..X",
		"XX.XX.XX",
		".XX..XX.",
		"........",
	},
	BoardShapeHeart8: {
		".XX..XX.",
		"XXXXXXXX",
		"XXXXXXXX",
		"XXXXXXXX",
		".XXXXXX.",
		"..XXXX..",
		"...XX...",
		"........",
	},
	BoardShapeHi8: {
		"........",
		"X..X.XXX",
		"X..X..X.",
		"XXXX..X.",
		"XXXX..X.",
		"X..X..X.",
		"X..X.XXX",
		"........",
	},
	BoardShapeRose8: {
		"..XXXX..",
		".X....X.",
		"X..XX..X",
		"X.XXXX.X",
		"X.XXXX.X",
		"X..XX..X",
		".X....X.",
		"..XXXX..",
	},
}

// boardShapeCells returns exact row-major grid cells for a sculpted board shape (or nil for default).
func boardShapeCells(shape uint8, cols, rows int) []gridCell {
	pat, ok := sculptedBoardPatterns[shape]
	if !ok {
		return nil
	}
	cells := make([]gridCell, 0, cols*rows)
	for r := 0; r < rows && r < len(pat); r++ {
		line := pat[r]
		for c := 0; c < cols && c < len(line); c++ {
			if line[c] == 'X' {
				cells = append(cells, gridCell{c: c, r: r})
			}
		}
	}
	return cells
}

// boardShapeTileCount returns the exact cell count of a sculpted board shape (0 if unknown/default).
func boardShapeTileCount(shape uint8, cols, rows int) int {
	return len(boardShapeCells(shape, cols, rows))
}

// relaxHoopSpacing gently separates any tightly-packed hoop pearls while clamping inside r <= 0.85.
func relaxHoopSpacing(pts []StitchPoint) []StitchPoint {
	n := len(pts)
	if n <= 1 {
		return pts
	}
	minDist := 0.165
	if n > 54 {
		minDist = 0.142
	} else if n > 40 {
		minDist = 0.152
	}
	minDist2 := minDist * minDist

	for iter := 0; iter < 16; iter++ {
		moved := false
		for i := 0; i < n; i++ {
			for j := i + 1; j < n; j++ {
				dx := float64(pts[j].X - pts[i].X)
				dz := float64(pts[j].Z - pts[i].Z)
				d2 := dx*dx + dz*dz
				if d2 < minDist2 {
					d := math.Sqrt(d2)
					if d < 1e-4 {
						ang := float64(i+j) * 1.6180339
						dx = math.Cos(ang) * 0.01
						dz = math.Sin(ang) * 0.01
						d = 0.01
					}
					push := (minDist - d) * 0.52
					nx := (dx / d) * push
					nz := (dz / d) * push
					pts[i].X -= float32(nx)
					pts[i].Z -= float32(nz)
					pts[j].X += float32(nx)
					pts[j].Z += float32(nz)
					moved = true
				}
			}
		}
		for i := 0; i < n; i++ {
			r := math.Hypot(float64(pts[i].X), float64(pts[i].Z))
			if r > 0.845 {
				scale := 0.845 / r
				pts[i].X = float32(float64(pts[i].X) * scale)
				pts[i].Z = float32(float64(pts[i].Z) * scale)
			}
		}
		if !moved {
			break
		}
	}
	return pts
}

// assignBalancedColors ensures every active palette color appears evenly across the silhouette
// while preserving visual symmetry along rings/layers.
func assignBalancedColors(pts []StitchPoint, pal []uint8, mode int) []StitchPoint {
	k := len(pal)
	if k <= 0 || len(pts) == 0 {
		return pts
	}
	for i := range pts {
		var cIdx int
		switch mode {
		case 0: // layer-banded + alternating accent
			cIdx = (int(pts[i].Layer)*2 + (i % 2)) % k
		case 1: // angular sector wedge
			ang := math.Atan2(float64(pts[i].Z), float64(pts[i].X)) + math.Pi
			sec := int(math.Floor(ang / (2.0 * math.Pi / float64(k))))
			if sec < 0 {
				sec = 0
			}
			cIdx = sec % k
		default: // smooth sequential cycle
			cIdx = i % k
		}
		pts[i].Color = pal[cIdx]
	}

	// Guarantee every color in pal has at least 2 stitches (or >=1 if tiny) so no color is missing!
	counts := make([]int, k)
	palPos := make(map[uint8]int, k)
	for idx, c := range pal {
		palPos[c] = idx
	}
	for _, p := range pts {
		counts[palPos[p.Color]]++
	}
	minPerColor := 2
	if len(pts) < k*2 {
		minPerColor = 1
	}
	for c := 0; c < k; c++ {
		for counts[c] < minPerColor {
			maxC := 0
			for m := 1; m < k; m++ {
				if counts[m] > counts[maxC] {
					maxC = m
				}
			}
			if counts[maxC] <= minPerColor {
				break
			}
			// Replace last occurrence of maxC
			for i := len(pts) - 1; i >= 0; i-- {
				if palPos[pts[i].Color] == maxC {
					pts[i].Color = pal[c]
					counts[maxC]--
					counts[c]++
					break
				}
			}
		}
	}
	return pts
}

// distributeCounts splits rem pearls cleanly across ring weights, ensuring sum == rem and each >= minEach.
func distributeCounts(rem int, weights []int, minEach []int) []int {
	out := make([]int, len(weights))
	totalW := 0
	for _, w := range weights {
		totalW += w
	}
	sum := 0
	for i, w := range weights {
		v := (rem * w) / totalW
		if v < minEach[i] {
			v = minEach[i]
		}
		out[i] = v
		sum += v
	}
	// Adjust remainder from outer ring inward
	for sum < rem {
		for i := len(out) - 1; i >= 0 && sum < rem; i-- {
			out[i]++
			sum++
		}
	}
	for sum > rem {
		for i := len(out) - 1; i >= 0 && sum > rem; i-- {
			if out[i] > minEach[i] {
				out[i]--
				sum--
			}
		}
	}
	return out
}

func buildScaledRings(count int, hasCenter bool, radii []float64, amps []float64, freqs []int, offsets []float64, layers []uint8, pal []uint8) []StitchPoint {
	pts := make([]StitchPoint, 0, count)
	rem := count
	if hasCenter && count > 0 {
		pts = append(pts, StitchPoint{X: 0, Z: 0, Color: pal[0], Layer: 0})
		rem--
	}
	ringN := len(radii)
	weights := make([]int, ringN)
	mins := make([]int, ringN)
	for i, r := range radii {
		weights[i] = int(math.Round(r * 100))
		mins[i] = 3
	}
	ringCounts := distributeCounts(rem, weights, mins)
	for i := 0; i < ringN; i++ {
		cA := pal[(i*2)%len(pal)]
		cB := pal[(i*2+1)%len(pal)]
		pts = append(pts, waveRingPoints(ringCounts[i], radii[i], amps[i], freqs[i], offsets[i], []uint8{cA, cB}, layers[i])...)
	}
	return pts
}

// buildSculptedHoopFromBoard mirrors a fun sculpted board mask directly into normalized hoop embroidery points!
func buildSculptedHoopFromBoard(shape uint8, cols, rows int, pal []uint8) []StitchPoint {
	cells := boardShapeCells(shape, cols, rows)
	if len(cells) == 0 {
		return nil
	}
	cx := float64(cols-1) * 0.5
	cz := float64(rows-1) * 0.5
	maxR := 0.0
	for _, cl := range cells {
		d := math.Hypot(float64(cl.c)-cx, float64(cl.r)-cz)
		if d > maxR {
			maxR = d
		}
	}
	if maxR < 1.0 {
		maxR = 1.0
	}
	scale := 0.78 / maxR
	pts := make([]StitchPoint, len(cells))
	for i, cl := range cells {
		x := (float64(cl.c) - cx) * scale
		z := (float64(cl.r) - cz) * scale
		r := math.Hypot(x, z)
		layer := uint8(0)
		if r > 0.56 {
			layer = 2
		} else if r > 0.30 {
			layer = 1
		}
		pts[i] = StitchPoint{
			X:     float32(x),
			Z:     float32(z),
			Color: pal[int(layer)%len(pal)],
			Layer: layer,
		}
	}
	pts = assignBalancedColors(pts, pal, 0)
	return relaxHoopSpacing(pts)
}

// buildArchetypeStitches synthesizes a distinct, zero-overlap hoop embroidery layout for any
// archetype (0..9), pearl count (14..62), and palette slice (3..6 colors).
func buildArchetypeStitches(archetype uint8, count int, pal []uint8, rot float64, petalAmp float64, freqShift int) []StitchPoint {
	var pts []StitchPoint
	k := len(pal)
	if k == 0 {
		pal = []uint8{0, 1, 2}
		k = 3
	}

	switch archetype {
	case HoopShapeBlossom:
		if count <= 34 {
			pts = buildScaledRings(
				count, true,
				[]float64{0.27, 0.54, 0.80},
				[]float64{0.0, petalAmp * 0.8, petalAmp},
				[]int{5, 5 + freqShift, 6 + freqShift},
				[]float64{rot, rot + math.Pi/5, rot},
				[]uint8{0, 1, 2},
				pal,
			)
		} else {
			pts = buildScaledRings(
				count, true,
				[]float64{0.21, 0.42, 0.63, 0.83},
				[]float64{0.0, 0.02, 0.025, petalAmp * 0.65},
				[]int{6, 5, 6 + freqShift, 6 + freqShift},
				[]float64{rot, rot + math.Pi/6, rot, rot + math.Pi/12},
				[]uint8{0, 1, 1, 2},
				pal,
			)
		}

	case HoopShapeStarburst:
		points := 5 + (freqShift % 3) // 5, 6, or 7-point star
		if count <= 34 {
			pts = buildScaledRings(
				count, true,
				[]float64{0.25, 0.52, 0.78},
				[]float64{0.03, 0.075, 0.085},
				[]int{points, points, points},
				[]float64{rot, rot + math.Pi/float64(points), rot},
				[]uint8{0, 1, 2},
				pal,
			)
		} else {
			pts = buildScaledRings(
				count, true,
				[]float64{0.20, 0.41, 0.62, 0.80},
				[]float64{0.02, 0.05, 0.06, 0.065},
				[]int{points, points, points, points},
				[]float64{rot, rot + math.Pi/float64(points), rot, rot + math.Pi/float64(points)},
				[]uint8{0, 1, 1, 2},
				pal,
			)
		}

	case HoopShapeHeart:
		// Parametric multi-shell heart (classic smooth embroidery heart) scaled to exact count
		pts = make([]StitchPoint, 0, count)
		shells := []float64{0.34, 0.64, 0.94}
		if count > 42 {
			shells = []float64{0.24, 0.48, 0.72, 0.96}
		}
		weights := make([]int, len(shells))
		mins := make([]int, len(shells))
		for i, s := range shells {
			weights[i] = int(math.Round(s * 100))
			mins[i] = 4
		}
		rem := count
		if count%2 == 1 {
			pts = append(pts, StitchPoint{X: 0, Z: -0.02, Color: pal[0], Layer: 0})
			rem--
		}
		sCounts := distributeCounts(rem, weights, mins)
		for si, sc := range shells {
			cN := sCounts[si]
			layer := uint8(si)
			if layer > 2 {
				layer = 2
			}
			for i := 0; i < cN; i++ {
				t := float64(i) * (2.0 * math.Pi / float64(cN))
				hx := 16.0 * math.Pow(math.Sin(t), 3)
				hz := -(13.0*math.Cos(t) - 5.0*math.Cos(2*t) - 2.0*math.Cos(3*t) - math.Cos(4*t))
				x := (hx / 18.5) * sc * 0.88
				z := ((hz + 1.8) / 18.5) * sc * 0.88
				pts = append(pts, StitchPoint{
					X:     float32(x),
					Z:     float32(z),
					Color: pal[(si*2+(i%2))%k],
					Layer: layer,
				})
			}
		}

	case HoopShapeSpiral:
		pts = make([]StitchPoint, 0, count)
		turns := 2.25 + float64(count)/45.0
		for i := 0; i < count; i++ {
			t := float64(i) / float64(count-1)
			r := 0.08 + 0.76*math.Sqrt(t)
			ang := rot + t*turns*2.0*math.Pi
			layer := uint8(0)
			if r > 0.60 {
				layer = 2
			} else if r > 0.36 {
				layer = 1
			}
			pts = append(pts, StitchPoint{
				X:     float32(math.Cos(ang) * r),
				Z:     float32(math.Sin(ang) * r),
				Color: pal[i%k],
				Layer: layer,
			})
		}

	case HoopShapeDiamond:
		// Concentric faceted diamonds (L1 / Manhattan shells rotated cleanly)
		pts = make([]StitchPoint, 0, count)
		pts = append(pts, StitchPoint{X: 0, Z: 0, Color: pal[0], Layer: 0})
		rem := count - 1
		radii := []float64{0.30, 0.56, 0.82}
		layers := []uint8{0, 1, 2}
		if count > 38 {
			radii = []float64{0.23, 0.44, 0.64, 0.83}
			layers = []uint8{0, 1, 1, 2}
		}
		weights := make([]int, len(radii))
		mins := make([]int, len(radii))
		for i, r := range radii {
			weights[i] = int(math.Round(r * 100))
			mins[i] = 4
		}
		sCounts := distributeCounts(rem, weights, mins)
		rotShift := 0.0
		if freqShift%2 == 1 {
			rotShift = math.Pi / 4.0
		}
		cosR, sinR := math.Cos(rotShift), math.Sin(rotShift)
		for si, r := range radii {
			cN := sCounts[si]
			for i := 0; i < cN; i++ {
				u := float64(i) / float64(cN) * 4.0
				var px, pz float64
				switch {
				case u < 1.0:
					px, pz = u*r, -(1.0-u)*r
				case u < 2.0:
					t := u - 1.0
					px, pz = (1.0-t)*r, t*r
				case u < 3.0:
					t := u - 2.0
					px, pz = -t*r, (1.0-t)*r
				default:
					t := u - 3.0
					px, pz = -(1.0-t)*r, -t*r
				}
				rx := px*cosR - pz*sinR
				rz := px*sinR + pz*cosR
				pts = append(pts, StitchPoint{
					X:     float32(rx),
					Z:     float32(rz),
					Color: pal[(si*2+(i%2))%k],
					Layer: layers[si],
				})
			}
		}

	case HoopShapeQuatrefoil:
		// 4-lobe cathedral clover / stained-glass tracery
		if count <= 34 {
			pts = buildScaledRings(
				count, true,
				[]float64{0.26, 0.53, 0.78},
				[]float64{0.02, 0.065, 0.075},
				[]int{4, 4, 4},
				[]float64{rot, rot, rot + math.Pi/4},
				[]uint8{0, 1, 2},
				pal,
			)
		} else {
			pts = buildScaledRings(
				count, true,
				[]float64{0.21, 0.42, 0.62, 0.81},
				[]float64{0.0, 0.045, 0.055, 0.055},
				[]int{4, 4, 4, 8},
				[]float64{rot, rot, rot + math.Pi/4, rot},
				[]uint8{0, 1, 1, 2},
				pal,
			)
		}

	case HoopShapeSunburst:
		// Radial spokes radiating out from a central jewel core
		pts = make([]StitchPoint, 0, count)
		pts = append(pts, StitchPoint{X: 0, Z: 0, Color: pal[0], Layer: 0})
		rem := count - 1
		spokes := 6
		if count >= 46 {
			spokes = 10
		} else if count >= 30 {
			spokes = 8
		}
		perSpoke := rem / spokes
		extra := rem % spokes
		for s := 0; s < spokes; s++ {
			ang := rot + float64(s)*(2.0*math.Pi/float64(spokes))
			steps := perSpoke
			if s < extra {
				steps++
			}
			for st := 0; st < steps; st++ {
				frac := float64(st+1) / float64(steps)
				r := 0.22 + frac*0.61
				// Slight alternating halo offset on outermost ring so wide spokes feel lush
				aOff := 0.0
				if st == steps-1 && s%2 == 1 {
					aOff = 0.08
				}
				layer := uint8(0)
				if frac > 0.70 {
					layer = 2
				} else if frac > 0.36 {
					layer = 1
				}
				pts = append(pts, StitchPoint{
					X:     float32(math.Cos(ang+aOff) * r),
					Z:     float32(math.Sin(ang+aOff) * r),
					Color: pal[(st+s%2)%k],
					Layer: layer,
				})
			}
		}

	case HoopShapeButterfly:
		// Bilaterally symmetric mirrored twin wings + central spine
		pts = make([]StitchPoint, 0, count)
		spineN := 3
		if count >= 38 {
			spineN = 5
		}
		if (count-spineN)%2 != 0 {
			spineN++
		}
		for i := 0; i < spineN; i++ {
			t := float64(i)/float64(spineN-1) - 0.5
			pts = append(pts, StitchPoint{
				X:     0,
				Z:     float32(t * 0.92),
				Color: pal[0],
				Layer: 0,
			})
		}
		pairs := (count - spineN) / 2
		for i := 0; i < pairs; i++ {
			t := (float64(i) + 0.5) / float64(pairs)
			// Sweep upper and lower wing lobes on +X and mirror to -X
			ang := -math.Pi*0.44 + t*math.Pi*0.88
			lobe := 0.52 + 0.32*math.Abs(math.Sin(ang*2.0))
			ringScale := 0.54
			layer := uint8(1)
			if i%2 == 1 {
				ringScale = 0.96
				layer = 2
			}
			r := lobe * ringScale
			x := math.Abs(math.Cos(ang))*r + 0.14
			z := math.Sin(ang) * r * 0.95
			if math.Hypot(x, z) > 0.84 {
				sc := 0.84 / math.Hypot(x, z)
				x *= sc
				z *= sc
			}
			col := pal[1+(i%(k-1))]
			pts = append(pts, StitchPoint{X: float32(x), Z: float32(z), Color: col, Layer: layer})
			pts = append(pts, StitchPoint{X: float32(-x), Z: float32(z), Color: col, Layer: layer})
		}

	case HoopShapeHexGrid:
		// Axial hexagonal honeycomb lattice sorted by radius from center
		type hPt struct {
			x, z, r float64
		}
		spacing := 0.23
		if count > 48 {
			spacing = 0.195
		} else if count > 34 {
			spacing = 0.21
		}
		cands := make([]hPt, 0, 91)
		for q := -5; q <= 5; q++ {
			for r := -5; r <= 5; r++ {
				if absInt(q+r) > 5 {
					continue
				}
				x := spacing * (math.Sqrt(3)*float64(q) + math.Sqrt(3)/2.0*float64(r))
				z := spacing * (1.5 * float64(r))
				dist := math.Hypot(x, z)
				if dist <= 0.84 {
					cands = append(cands, hPt{x: x, z: z, r: dist})
				}
			}
		}
		// Sort by distance from center, breaking ties by angle
		for i := 0; i < len(cands); i++ {
			for j := i + 1; j < len(cands); j++ {
				if cands[j].r < cands[i].r-1e-4 || (math.Abs(cands[j].r-cands[i].r) <= 1e-4 && math.Atan2(cands[j].z, cands[j].x) < math.Atan2(cands[i].z, cands[i].x)) {
					cands[i], cands[j] = cands[j], cands[i]
				}
			}
		}
		if len(cands) > count {
			cands = cands[:count]
		}
		cosR, sinR := math.Cos(rot), math.Sin(rot)
		pts = make([]StitchPoint, 0, len(cands))
		for i, c := range cands {
			rx := c.x*cosR - c.z*sinR
			rz := c.x*sinR + c.z*cosR
			layer := uint8(0)
			if c.r > 0.56 {
				layer = 2
			} else if c.r > 0.28 {
				layer = 1
			}
			pts = append(pts, StitchPoint{
				X:     float32(rx),
				Z:     float32(rz),
				Color: pal[(int(layer)*2+i%2)%k],
				Layer: layer,
			})
		}

	default: // HoopShapeRoseWindow
		if count <= 34 {
			pts = buildScaledRings(
				count, true,
				[]float64{0.25, 0.52, 0.80},
				[]float64{0.0, 0.025, 0.035},
				[]int{6, 6, 8},
				[]float64{rot, rot + math.Pi/12, rot},
				[]uint8{0, 1, 2},
				pal,
			)
		} else {
			pts = buildScaledRings(
				count, true,
				[]float64{0.21, 0.42, 0.63, 0.84},
				[]float64{0.0, 0.018, 0.020, 0.028},
				[]int{6, 6, 8, 8},
				[]float64{rot, rot + math.Pi/12, rot, rot + math.Pi/16},
				[]uint8{0, 1, 1, 2},
				pal,
			)
		}
	}

	// Ensure exact length == count (safety guard for any edge case)
	if len(pts) > count {
		pts = pts[:count]
	}
	for len(pts) < count {
		ang := float64(len(pts)) * 2.3999632
		pts = append(pts, StitchPoint{
			X:     float32(math.Cos(ang) * 0.78),
			Z:     float32(math.Sin(ang) * 0.78),
			Color: pal[len(pts)%k],
			Layer: 2,
		})
	}

	colorMode := 0
	if archetype == HoopShapeSpiral || archetype == HoopShapeSunburst {
		colorMode = 1
	}
	pts = assignBalancedColors(pts, pal, colorMode)
	return relaxHoopSpacing(pts)
}
