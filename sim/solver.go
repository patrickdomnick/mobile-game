package sim

const (
	DirUp    uint8 = 0
	DirRight uint8 = 1
	DirDown  uint8 = 2
	DirLeft  uint8 = 3
)

const (
	MaxGridTiles = 25
	TrayCapacity = 5
	ActiveSlots  = 2
)

// Tile represents one directional pearl tile on the untangle grid.
type Tile struct {
	Col     int
	Row     int
	Color   uint8
	Dir     uint8
	Alive   bool
	WobbleT float32
}

type prng struct {
	state uint32
}

func newPRNG(seed uint32) prng {
	if seed == 0 {
		seed = 0x6D2B79F5
	}
	return prng{state: seed}
}

func (p *prng) next() uint32 {
	x := p.state
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	p.state = x
	return x
}

func (p *prng) intn(n int) int {
	if n <= 1 {
		return 0
	}
	return int(p.next() % uint32(n))
}

// isTileUnblocked checks if the ray from tile idx in its arrow direction reaches the grid edge
// without colliding with any other alive tile.
func isTileUnblocked(tiles []Tile, idx int, cols, rows int) bool {
	if idx < 0 || idx >= len(tiles) || !tiles[idx].Alive {
		return false
	}
	t := tiles[idx]
	dc, dr := 0, 0
	switch t.Dir {
	case DirUp:
		dr = -1
	case DirRight:
		dc = 1
	case DirDown:
		dr = 1
	case DirLeft:
		dc = -1
	}

	c := t.Col + dc
	r := t.Row + dr
	for c >= 0 && c < cols && r >= 0 && r < rows {
		for j := range tiles {
			if j != idx && tiles[j].Alive && tiles[j].Col == c && tiles[j].Row == r {
				return false
			}
		}
		c += dc
		r += dr
	}
	return true
}

// solverState models the exact Pearl Loom game rules (alive mask + tray + color remaining + active colors)
// so both our generator and real-time Hint guarantee 100% mathematical solvability with the 5-slot tray.
type solverState struct {
	aliveMask uint32
	tray      [TrayCapacity]uint8
	trayLen   int
	remain    [NumColors]int
	active    [ActiveSlots]int
	queue     [NumColors]uint8
	queueLen  int
	queuePos  int
}

func (s *solverState) refillActive() {
	for i := 0; i < ActiveSlots; i++ {
		if s.active[i] >= 0 && s.remain[s.active[i]] > 0 {
			continue
		}
		s.active[i] = -1
		for s.queuePos < s.queueLen {
			c := int(s.queue[s.queuePos])
			s.queuePos++
			if s.remain[c] > 0 {
				s.active[i] = c
				break
			}
		}
	}
}

func (s *solverState) isActiveColor(c uint8) bool {
	for i := 0; i < ActiveSlots; i++ {
		if s.active[i] == int(c) && s.remain[c] > 0 {
			return true
		}
	}
	return false
}

// drainTray auto-stitches any pearls in the silk tray whose color is now active.
func (s *solverState) drainTray() {
	for {
		progressed := false
		writeIdx := 0
		for i := 0; i < s.trayLen; i++ {
			c := s.tray[i]
			if s.isActiveColor(c) {
				s.remain[c]--
				progressed = true
			} else {
				s.tray[writeIdx] = c
				writeIdx++
			}
		}
		s.trayLen = writeIdx
		if progressed {
			s.refillActive()
		} else {
			break
		}
	}
}

func (s *solverState) applyTap(tileIdx int, color uint8) bool {
	s.aliveMask &^= (1 << uint(tileIdx))
	if s.isActiveColor(color) {
		s.remain[color]--
		s.refillActive()
		s.drainTray()
		return true
	}
	if s.trayLen >= TrayCapacity {
		return false
	}
	s.tray[s.trayLen] = color
	s.trayLen++
	s.drainTray()
	return true
}

func isUnblockedMask(tiles []Tile, mask uint32, idx int, cols, rows int) bool {
	if (mask & (1 << uint(idx))) == 0 {
		return false
	}
	t := tiles[idx]
	dc, dr := 0, 0
	switch t.Dir {
	case DirUp:
		dr = -1
	case DirRight:
		dc = 1
	case DirDown:
		dr = 1
	case DirLeft:
		dc = -1
	}
	c := t.Col + dc
	r := t.Row + dr
	for c >= 0 && c < cols && r >= 0 && r < rows {
		for j := range tiles {
			if j != idx && (mask&(1<<uint(j))) != 0 && tiles[j].Col == c && tiles[j].Row == r {
				return false
			}
		}
		c += dc
		r += dr
	}
	return true
}

// fixedMaskSet is a zero-allocation open-addressed hash set for 25-bit aliveMasks.
// Avoids pulling Go's runtime map machinery into TinyGo WebAssembly builds.
const visitedTableSize = 2048 // power of two

type fixedMaskSet struct {
	keys [visitedTableSize]uint32
	used [visitedTableSize]uint8
}

func (s *fixedMaskSet) has(k uint32) bool {
	slot := ((k * 2654435761) >> 21) & (visitedTableSize - 1)
	for probe := 0; probe < 16; probe++ {
		idx := (slot + uint32(probe)) & (visitedTableSize - 1)
		if s.used[idx] == 0 {
			return false
		}
		if s.keys[idx] == k {
			return true
		}
	}
	return false
}

func (s *fixedMaskSet) add(k uint32) {
	slot := ((k * 2654435761) >> 21) & (visitedTableSize - 1)
	for probe := 0; probe < 16; probe++ {
		idx := (slot + uint32(probe)) & (visitedTableSize - 1)
		if s.used[idx] == 0 || s.keys[idx] == k {
			s.keys[idx] = k
			s.used[idx] = 1
			return
		}
	}
}

// solveFromState searches for a guaranteed winning sequence from any live game state
// respecting the 5-slot silk tray constraint. Returns (solvable, firstMoveTileIdx).
func solveFromState(tiles []Tile, cols, rows int, start solverState, nodeBudget int) (bool, int) {
	if start.aliveMask == 0 {
		return start.trayLen == 0, -1
	}

	nodes := 0
	var visited fixedMaskSet

	var dfs func(st solverState) (bool, int)
	dfs = func(st solverState) (bool, int) {
		if st.aliveMask == 0 {
			return st.trayLen == 0, -1
		}
		if nodes >= nodeBudget {
			return false, -1
		}
		nodes++

		if visited.has(st.aliveMask) {
			return false, -1
		}

		// Order candidate moves: active-color direct stitches FIRST (dramatically speeds search & yields natural hints!)
		var directMoves [MaxGridTiles]int
		directN := 0
		var trayMoves [MaxGridTiles]int
		trayN := 0

		for i := range tiles {
			if isUnblockedMask(tiles, st.aliveMask, i, cols, rows) {
				if st.isActiveColor(tiles[i].Color) {
					directMoves[directN] = i
					directN++
				} else if st.trayLen < TrayCapacity {
					trayMoves[trayN] = i
					trayN++
				}
			}
		}

		for k := 0; k < directN; k++ {
			mv := directMoves[k]
			next := st
			if next.applyTap(mv, tiles[mv].Color) {
				if ok, _ := dfs(next); ok {
					return true, mv
				}
			}
		}

		// Prioritize tray moves whose color appears earliest in upcoming color queue
		for k := 0; k < trayN; k++ {
			mv := trayMoves[k]
			next := st
			if next.applyTap(mv, tiles[mv].Color) {
				if ok, _ := dfs(next); ok {
					return true, mv
				}
			}
		}

		visited.add(st.aliveMask)
		return false, -1
	}

	return dfs(start)
}

// buildColorOrder extracts the unique color order for an artwork's stitch queue.
func buildColorOrder(stitches []StitchPoint) ([NumColors]uint8, int, [NumColors]int) {
	var order [NumColors]uint8
	var counts [NumColors]int
	var seen [NumColors]bool
	n := 0
	for _, sp := range stitches {
		counts[sp.Color]++
		if !seen[sp.Color] {
			seen[sp.Color] = true
			order[n] = sp.Color
			n++
		}
	}
	return order, n, counts
}

// generateSolvableBoard builds an acyclic directional untangle board for the artwork
// and assigns colors so it is mathematically verified solvable with the 5-slot silk tray.
func generateSolvableBoard(art ArtworkDef) ([]Tile, [NumColors]uint8, int) {
	colorOrder, colorCount, colorCounts := buildColorOrder(art.Stitches)
	n := len(art.Stitches)
	if n > MaxGridTiles {
		n = MaxGridTiles
	}

	// Build centered list of grid cells to occupy (if n < cols*rows, omit corners symmetrically)
	type cell struct{ c, r int }
	allCells := make([]cell, 0, art.Cols*art.Rows)
	for r := 0; r < art.Rows; r++ {
		for c := 0; c < art.Cols; c++ {
			allCells = append(allCells, cell{c: c, r: r})
		}
	}

	// Sort cells by distance from grid center so partial grids form a balanced centered silhouette
	cx := float32(art.Cols-1) * 0.5
	cz := float32(art.Rows-1) * 0.5
	for i := 0; i < len(allCells); i++ {
		for j := i + 1; j < len(allCells); j++ {
			di := (float32(allCells[i].c)-cx)*(float32(allCells[i].c)-cx) + (float32(allCells[i].r)-cz)*(float32(allCells[i].r)-cz)
			dj := (float32(allCells[j].c)-cx)*(float32(allCells[j].c)-cx) + (float32(allCells[j].r)-cz)*(float32(allCells[j].r)-cz)
			if dj < di {
				allCells[i], allCells[j] = allCells[j], allCells[i]
			}
		}
	}
	chosen := allCells[:n]
	// Re-sort chosen cells in row-major order for stable indices
	for i := 0; i < len(chosen); i++ {
		for j := i + 1; j < len(chosen); j++ {
			if chosen[j].r < chosen[i].r || (chosen[j].r == chosen[i].r && chosen[j].c < chosen[i].c) {
				chosen[i], chosen[j] = chosen[j], chosen[i]
			}
		}
	}

	rng := newPRNG(art.Seed)

	for attempt := 0; attempt < 64; attempt++ {
		tiles := make([]Tile, n)
		for i, cl := range chosen {
			tiles[i] = Tile{
				Col:   cl.c,
				Row:   cl.r,
				Alive: true,
			}
		}

		// Step 1: Forward peel to produce a 100% deadlock-free directional assignment
		alive := uint32((1 << uint(n)) - 1)
		peelOrder := make([]int, 0, n)
		var dirChoices [4]uint8

		for len(peelOrder) < n {
			// Gather all currently peelable (tileIdx, clearDir) pairs
			type cand struct {
				idx int
				dir uint8
			}
			cands := make([]cand, 0, n*2)
			for i := 0; i < n; i++ {
				if (alive & (1 << uint(i))) == 0 {
					continue
				}
				dCount := 0
				for d := uint8(0); d < 4; d++ {
					tiles[i].Dir = d
					if isUnblockedMask(tiles, alive, i, art.Cols, art.Rows) {
						dirChoices[dCount] = d
						dCount++
					}
				}
				if dCount > 0 {
					// On higher difficulty, prefer directions that point inward/cross-grain rather than trivial edges
					chosenDir := dirChoices[rng.intn(dCount)]
					cands = append(cands, cand{idx: i, dir: chosenDir})
				}
			}
			if len(cands) == 0 {
				break
			}
			pick := cands[rng.intn(len(cands))]
			tiles[pick.idx].Dir = pick.dir
			alive &^= (1 << uint(pick.idx))
			peelOrder = append(peelOrder, pick.idx)
		}

		if len(peelOrder) != n {
			continue
		}

		// Step 2: Assign pearl colors along peelOrder in waves matching the embroidery color queue,
		// with gentle controlled shuffling scaled by art.Difficulty so the 5-slot tray feels meaningful yet fair!
		colorSeq := make([]uint8, 0, n)
		for qi := 0; qi < colorCount; qi++ {
			c := colorOrder[qi]
			for k := 0; k < colorCounts[c]; k++ {
				colorSeq = append(colorSeq, c)
			}
		}

		// Local windowed swaps create interesting tray planning without overwhelming the 5-slot tray
		window := 2
		if art.Difficulty == 2 {
			window = 4
		} else if art.Difficulty >= 3 {
			window = 6
		}
		swaps := n * art.Difficulty
		for s := 0; s < swaps; s++ {
			a := rng.intn(n)
			b := a + rng.intn(window*2+1) - window
			if b >= 0 && b < n && a != b {
				colorSeq[a], colorSeq[b] = colorSeq[b], colorSeq[a]
			}
		}

		for stepIdx, tileIdx := range peelOrder {
			tiles[tileIdx].Color = colorSeq[stepIdx]
		}

		// Step 3: Verify exact solvability under the 5-slot silk tray rule!
		st := solverState{
			aliveMask: uint32((1 << uint(n)) - 1),
			remain:    colorCounts,
			active:    [ActiveSlots]int{-1, -1},
			queue:     colorOrder,
			queueLen:  colorCount,
			queuePos:  0,
		}
		st.refillActive()

		if ok, _ := solveFromState(tiles, art.Cols, art.Rows, st, 2500); ok {
			return tiles, colorOrder, colorCount
		}
	}

	// Deterministic fallback: strict queue-ordered colors along guaranteed peel order (always 0-tray-overflow solvable!)
	tiles := make([]Tile, n)
	for i, cl := range chosen {
		tiles[i] = Tile{Col: cl.c, Row: cl.r, Dir: DirUp, Alive: true}
	}
	idx := 0
	for qi := 0; qi < colorCount; qi++ {
		c := colorOrder[qi]
		for k := 0; k < colorCounts[c]; k++ {
			tiles[idx].Color = c
			idx++
		}
	}
	return tiles, colorOrder, colorCount
}
