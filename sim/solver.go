package sim

const (
	DirUp    uint8 = 0
	DirRight uint8 = 1
	DirDown  uint8 = 2
	DirLeft  uint8 = 3
)

const (
	SpecialNone    uint8 = 0
	SpecialHeart   uint8 = 1 // True 3D sculpted heart pearl (early-placement bonus)
	SpecialRainbow uint8 = 2 // Wild pearl matching any active color (leaves 1 surplus pearl)
	SpecialHidden  uint8 = 3 // Concealed obsidian-black pearl until stitchable (unblocked + active color)
	SpecialLocked  uint8 = 4 // Locked pearl until all 4 orthogonal adjacent cells are cleared
)

const (
	MaxGridTiles = 64 // Up to full 8x8 campaign boards (absolute iPhone 16 limit)
	TrayCapacity = 5
	ActiveSlots  = 2
)

func fullMask(n int) uint64 {
	if n >= 64 {
		return ^uint64(0)
	}
	if n <= 0 {
		return 0
	}
	return (uint64(1) << uint(n)) - 1
}

// Tile represents one directional pearl tile on the untangle grid.
type Tile struct {
	Col         int
	Row         int
	Color       uint8
	Dir         uint8
	Alive       bool
	IsHeart     bool
	Special     uint8
	Revealed    bool // Used by SpecialHidden (false = concealed black, true = revealed true color)
	Unlocked    bool // Used by SpecialLocked (false = locked by adjacent pearls, true = unlocked)
	WobbleT     float32
	JiggleT     float32
	JiggleDelay float32
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

func absInt(v int) int {
	if v < 0 {
		return -v
	}
	return v
}

// findFirstBlocker returns the exact index of the nearest alive tile blocking tile idx along its arrow ray,
// or -1 if the path to the board edge is clear.
func findFirstBlocker(tiles []Tile, idx int, cols, rows int) int {
	if idx < 0 || idx >= len(tiles) || !tiles[idx].Alive {
		return -1
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
				return j
			}
		}
		c += dc
		r += dr
	}
	return -1
}

func isTileUnblocked(tiles []Tile, idx int, cols, rows int) bool {
	if idx < 0 || idx >= len(tiles) || !tiles[idx].Alive {
		return false
	}
	return findFirstBlocker(tiles, idx, cols, rows) < 0
}

// adjacentAliveDirMask returns a 4-bit N/E/S/W bitmask of alive orthogonal adjacent tiles around idx:
// bit 0 (1)=North (row-1), bit 1 (2)=East (col+1), bit 2 (4)=South (row+1), bit 3 (8)=West (col-1).
func adjacentAliveDirMask(tiles []Tile, idx int) uint32 {
	if idx < 0 || idx >= len(tiles) || !tiles[idx].Alive {
		return 0
	}
	tc := tiles[idx].Col
	tr := tiles[idx].Row
	var mask uint32
	for j := range tiles {
		if j == idx || !tiles[j].Alive {
			continue
		}
		dc := tiles[j].Col - tc
		dr := tiles[j].Row - tr
		if dc == 0 && dr == -1 {
			mask |= 1
		} else if dc == 1 && dr == 0 {
			mask |= 2
		} else if dc == 0 && dr == 1 {
			mask |= 4
		} else if dc == -1 && dr == 0 {
			mask |= 8
		}
	}
	return mask
}

// findFirstAdjacentAlive returns the index of an alive orthogonal neighbor around idx, or -1 if none exist.
func findFirstAdjacentAlive(tiles []Tile, idx int) int {
	if idx < 0 || idx >= len(tiles) || !tiles[idx].Alive {
		return -1
	}
	tc := tiles[idx].Col
	tr := tiles[idx].Row
	for j := range tiles {
		if j == idx || !tiles[j].Alive {
			continue
		}
		if absInt(tiles[j].Col-tc)+absInt(tiles[j].Row-tr) == 1 {
			return j
		}
	}
	return -1
}

func hasAdjacentAliveMask(tiles []Tile, mask uint64, idx int) bool {
	tc := tiles[idx].Col
	tr := tiles[idx].Row
	for j := range tiles {
		if j == idx || (mask&(uint64(1)<<uint(j))) == 0 {
			continue
		}
		if absInt(tiles[j].Col-tc)+absInt(tiles[j].Row-tr) == 1 {
			return true
		}
	}
	return false
}

func isTileLockedNow(tiles []Tile, idx int) bool {
	if idx < 0 || idx >= len(tiles) || !tiles[idx].Alive {
		return false
	}
	if tiles[idx].Special != SpecialLocked || tiles[idx].Unlocked {
		return false
	}
	return adjacentAliveDirMask(tiles, idx) != 0
}

// ThreeStarTrayLimit returns the maximum number of tray drops allowed for a 3-star rating.
func ThreeStarTrayLimit(totalPearls int) int {
	return totalPearls / 6
}

type solverState struct {
	aliveMask uint64
	tray      [TrayCapacity]uint8
	trayLen   int
	trayUses  int
	remain    [NumColors]int
	active    [ActiveSlots]int
	queue     [NumColors]uint8
	queueLen  int
	queuePos  int
}

func (s *solverState) isComplete() bool {
	for c := 0; c < NumColors; c++ {
		if s.remain[c] > 0 {
			return false
		}
	}
	return true
}

func (s *solverState) pickRainbowColor() int {
	best := -1
	bestRem := 0
	for i := 0; i < ActiveSlots; i++ {
		c := s.active[i]
		if c >= 0 && s.remain[c] > bestRem {
			best = c
			bestRem = s.remain[c]
		}
	}
	return best
}

func (s *solverState) refillActive() {
	activeAlive := 0
	for i := 0; i < ActiveSlots; i++ {
		if s.active[i] >= 0 && s.remain[s.active[i]] > 0 {
			activeAlive++
		} else {
			s.active[i] = -1
		}
	}

	// Fill empty slots, EXCEPT hold back the very last color in the queue until all other
	// active colors are completely finished (so the final two colors unlock separately!).
	for i := 0; i < ActiveSlots; i++ {
		if s.active[i] >= 0 {
			continue
		}
		for s.queuePos < s.queueLen {
			c := int(s.queue[s.queuePos])
			if s.remain[c] <= 0 {
				s.queuePos++
				continue
			}
			isFinalColor := s.queueLen >= 3 && s.queuePos == s.queueLen-1
			if isFinalColor && activeAlive > 0 {
				return
			}
			s.queuePos++
			s.active[i] = c
			activeAlive++
			break
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

func (s *solverState) nextQueuedColor() int {
	for p := s.queuePos; p < s.queueLen; p++ {
		c := int(s.queue[p])
		if s.remain[c] > 0 && !s.isActiveColor(uint8(c)) {
			return c
		}
	}
	return -1
}

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

func (s *solverState) applyTap(tileIdx int, color uint8, isRainbow bool) bool {
	s.aliveMask &^= (uint64(1) << uint(tileIdx))
	if isRainbow {
		rc := s.pickRainbowColor()
		if rc >= 0 {
			s.remain[rc]--
			s.refillActive()
			s.drainTray()
			return true
		}
		return false
	}
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
	s.trayUses++
	s.drainTray()
	return true
}

func isUnblockedMask(tiles []Tile, mask uint64, idx int, cols, rows int) bool {
	if (mask & (uint64(1) << uint(idx))) == 0 {
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
			if j != idx && (mask&(uint64(1)<<uint(j))) != 0 && tiles[j].Col == c && tiles[j].Row == r {
				return false
			}
		}
		c += dc
		r += dr
	}
	return true
}

// isPlayableMask checks BOTH arrow-lane clearance AND Locked-Pearl 4-neighbor clearance!
func isPlayableMask(tiles []Tile, mask uint64, idx int, cols, rows int) bool {
	if !isUnblockedMask(tiles, mask, idx, cols, rows) {
		return false
	}
	if tiles[idx].Special == SpecialLocked && !tiles[idx].Unlocked && hasAdjacentAliveMask(tiles, mask, idx) {
		return false
	}
	return true
}

// scoreTrayCandidate prioritizes tray moves that directly unblock active-color pearls,
// free Locked Pearls, or hold the next-up color so DFS finds winning escapes rapidly!
func scoreTrayCandidate(tiles []Tile, st *solverState, idx int, cols, rows int) int {
	score := 0
	if int(tiles[idx].Color) == st.nextQueuedColor() {
		score += 6
	}
	nextMask := st.aliveMask &^ (uint64(1) << uint(idx))
	tc := tiles[idx].Col
	tr := tiles[idx].Row
	for j := range tiles {
		if j == idx || (nextMask&(uint64(1)<<uint(j))) == 0 {
			continue
		}
		// Bonus for peeling a neighbor off a Locked Pearl!
		if tiles[j].Special == SpecialLocked && absInt(tiles[j].Col-tc)+absInt(tiles[j].Row-tr) == 1 {
			score += 9
		}
		if tiles[j].Col != tc && tiles[j].Row != tr {
			continue
		}
		if !isUnblockedMask(tiles, st.aliveMask, j, cols, rows) && isUnblockedMask(tiles, nextMask, j, cols, rows) {
			if tiles[j].Special == SpecialRainbow || st.isActiveColor(tiles[j].Color) {
				score += 14
			} else {
				score += 3
			}
		}
	}
	return score
}

// fixedMaskSet is a zero-allocation open-addressed hash set for full 64-bit aliveMasks + separate trayUses tag.
// Stored in static BSS (not goroutine stack!) with an O(1) generation counter so TinyGo WASM never overflows its stack on 8x8 boards.
const visitedTableSize = 8192 // power of two

type fixedMaskSet struct {
	keys [visitedTableSize]uint64
	tags [visitedTableSize]uint8
	gens [visitedTableSize]uint32
	gen  uint32
}

type dfsFrame struct {
	directMoves [MaxGridTiles]uint8
	trayMoves   [MaxGridTiles]uint8
	trayScores  [MaxGridTiles]int16
}

var (
	solverVisited fixedMaskSet
	solverFrames  [MaxGridTiles + 2]dfsFrame
)

func (s *fixedMaskSet) reset() {
	s.gen++
	if s.gen == 0 {
		for i := range s.gens {
			s.gens[i] = 0
		}
		s.gen = 1
	}
}

func (s *fixedMaskSet) hash(k uint64, tag uint8) uint32 {
	h := k ^ (uint64(tag) * 0x9e3779b97f4a7c15)
	h ^= h >> 30
	h *= 0xbf58476d1ce4e5b9
	h ^= h >> 27
	return uint32(h) & (visitedTableSize - 1)
}

func (s *fixedMaskSet) has(k uint64, tag uint8) bool {
	slot := s.hash(k, tag)
	g := s.gen
	for probe := 0; probe < 16; probe++ {
		idx := (slot + uint32(probe)) & (visitedTableSize - 1)
		if s.gens[idx] != g {
			return false
		}
		if s.keys[idx] == k && s.tags[idx] == tag {
			return true
		}
	}
	return false
}

func (s *fixedMaskSet) add(k uint64, tag uint8) {
	slot := s.hash(k, tag)
	g := s.gen
	for probe := 0; probe < 16; probe++ {
		idx := (slot + uint32(probe)) & (visitedTableSize - 1)
		if s.gens[idx] != g || (s.keys[idx] == k && s.tags[idx] == tag) {
			s.keys[idx] = k
			s.tags[idx] = tag
			s.gens[idx] = g
			return
		}
	}
}

// solveWithTrayBudgetDetailed returns (solved, firstMove, exhausted) while enforcing an optional
// cumulative trayUses <= maxTrayUses budget (pass maxTrayUses < 0 for unrestricted search).
func solveWithTrayBudgetDetailed(tiles []Tile, cols, rows int, start solverState, maxTrayUses int, nodeBudget int) (bool, int, bool) {
	if start.isComplete() {
		return maxTrayUses < 0 || start.trayUses <= maxTrayUses, -1, true
	}

	nodes := 0
	hitBudget := false
	solverVisited.reset()

	var dfs func(st solverState, depth int) (bool, int)
	dfs = func(st solverState, depth int) (bool, int) {
		if st.isComplete() {
			return maxTrayUses < 0 || st.trayUses <= maxTrayUses, -1
		}
		if st.aliveMask == 0 {
			return false, -1
		}
		if nodes >= nodeBudget || depth >= len(solverFrames) {
			hitBudget = true
			return false, -1
		}
		nodes++

		visitTag := uint8(0)
		if maxTrayUses >= 0 {
			visitTag = uint8(st.trayUses & 0xFF)
		}
		if solverVisited.has(st.aliveMask, visitTag) {
			return false, -1
		}

		frame := &solverFrames[depth]
		directN := 0
		trayN := 0
		canUseTray := st.trayLen < TrayCapacity && (maxTrayUses < 0 || st.trayUses < maxTrayUses)

		for i := range tiles {
			if isPlayableMask(tiles, st.aliveMask, i, cols, rows) {
				isRain := tiles[i].Special == SpecialRainbow
				if isRain || st.isActiveColor(tiles[i].Color) {
					frame.directMoves[directN] = uint8(i)
					directN++
				} else if canUseTray {
					frame.trayMoves[trayN] = uint8(i)
					frame.trayScores[trayN] = int16(scoreTrayCandidate(tiles, &st, i, cols, rows))
					trayN++
				}
			}
		}

		// Try direct-stitch & Rainbow moves first (preserve tray space & build streak!)
		for k := 0; k < directN; k++ {
			mv := int(frame.directMoves[k])
			next := st
			if next.applyTap(mv, tiles[mv].Color, tiles[mv].Special == SpecialRainbow) {
				if ok, _ := dfs(next, depth+1); ok {
					return true, mv
				}
			}
		}

		// Sort tray candidates descending by pinch-escape heuristic
		for a := 1; a < trayN; a++ {
			mv := frame.trayMoves[a]
			sc := frame.trayScores[a]
			b := a - 1
			for b >= 0 && frame.trayScores[b] < sc {
				frame.trayMoves[b+1] = frame.trayMoves[b]
				frame.trayScores[b+1] = frame.trayScores[b]
				b--
			}
			frame.trayMoves[b+1] = mv
			frame.trayScores[b+1] = sc
		}

		for k := 0; k < trayN; k++ {
			mv := int(frame.trayMoves[k])
			next := st
			if next.applyTap(mv, tiles[mv].Color, false) {
				if ok, _ := dfs(next, depth+1); ok {
					return true, mv
				}
			}
		}

		solverVisited.add(st.aliveMask, visitTag)
		return false, -1
	}

	ok, mv := dfs(start, 0)
	return ok, mv, !hitBudget
}

// solveFromStateDetailed returns (solved, firstMove, exhausted).
func solveFromStateDetailed(tiles []Tile, cols, rows int, start solverState, nodeBudget int) (bool, int, bool) {
	return solveWithTrayBudgetDetailed(tiles, cols, rows, start, -1, nodeBudget)
}

// solveWithTrayBudget finds a guaranteed winning sequence staying within maxTrayUses total tray drops.
func solveWithTrayBudget(tiles []Tile, cols, rows int, start solverState, maxTrayUses int, nodeBudget int) (bool, int) {
	ok, mv, _ := solveWithTrayBudgetDetailed(tiles, cols, rows, start, maxTrayUses, nodeBudget)
	return ok, mv
}

// solveFromState finds a guaranteed winning sequence respecting the 5-slot silk tray rule.
func solveFromState(tiles []Tile, cols, rows int, start solverState, nodeBudget int) (bool, int) {
	ok, mv, _ := solveFromStateDetailed(tiles, cols, rows, start, nodeBudget)
	return ok, mv
}

// pickBestHeuristicMove selects the smartest legal playable move if a very deep board hits search budget.
func pickBestHeuristicMove(tiles []Tile, cols, rows int, st solverState) int {
	for i := range tiles {
		if isPlayableMask(tiles, st.aliveMask, i, cols, rows) &&
			(tiles[i].Special == SpecialRainbow || st.isActiveColor(tiles[i].Color)) {
			return i
		}
	}
	if st.trayLen >= TrayCapacity {
		return -1
	}
	bestIdx := -1
	bestScore := -1
	for i := range tiles {
		if isPlayableMask(tiles, st.aliveMask, i, cols, rows) {
			sc := scoreTrayCandidate(tiles, &st, i, cols, rows)
			if sc > bestScore {
				bestScore = sc
				bestIdx = i
			}
		}
	}
	return bestIdx
}

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

func distToEdge(c, r, cols, rows int, dir uint8) int {
	switch dir {
	case DirUp:
		return r
	case DirRight:
		return cols - 1 - c
	case DirDown:
		return rows - 1 - r
	default:
		return c
	}
}

// assignSpecialPearls stamps Rainbow, Locked, Hidden, and Heart pearls onto a freshly peeled board
// so every Locked pearl is structurally unlockable (all orthogonal neighbors peeled earlier) and
// every Hidden pearl begins genuinely hidden whenever possible.
func assignSpecialPearls(tiles []Tile, peelOrder []int, art ArtworkDef, colorOrder [NumColors]uint8, colorCount int, rng *prng) {
	n := len(tiles)
	if n == 0 {
		return
	}
	// Map tileIdx -> position in peelOrder
	var peelRank [MaxGridTiles]int
	for pos, tidx := range peelOrder {
		peelRank[tidx] = pos
	}

	// 1. Place Locked Pearls on tiles whose 4 orthogonal neighbors ALL peel strictly earlier (guaranteed deadlock-free!)
	if art.MaxLocked > 0 {
		var lockCands [MaxGridTiles]int
		nLock := 0
		for i := 0; i < n; i++ {
			if tiles[i].Special != SpecialNone {
				continue
			}
			adjCount := 0
			allEarlier := true
			for j := 0; j < n; j++ {
				if i == j {
					continue
				}
				if absInt(tiles[j].Col-tiles[i].Col)+absInt(tiles[j].Row-tiles[i].Row) == 1 {
					adjCount++
					if peelRank[j] >= peelRank[i] {
						allEarlier = false
						break
					}
				}
			}
			// Must have at least 2 orthogonal neighbors at start so clearing neighbors is genuinely fun!
			if allEarlier && adjCount >= 2 {
				lockCands[nLock] = i
				nLock++
			}
		}
		// Shuffle candidates & place up to art.MaxLocked (avoiding placing 2 Locked pearls adjacent to each other!)
		for i := nLock - 1; i > 0; i-- {
			j := rng.intn(i + 1)
			lockCands[i], lockCands[j] = lockCands[j], lockCands[i]
		}
		placed := 0
		for k := 0; k < nLock && placed < art.MaxLocked; k++ {
			idx := lockCands[k]
			adjLocked := false
			for j := 0; j < n; j++ {
				if tiles[j].Special == SpecialLocked && absInt(tiles[j].Col-tiles[idx].Col)+absInt(tiles[j].Row-tiles[idx].Row) == 1 {
					adjLocked = true
					break
				}
			}
			if adjLocked {
				continue
			}
			tiles[idx].Special = SpecialLocked
			tiles[idx].Unlocked = false
			placed++
		}
	}

	// Determine starting active colors (first 2 colors in queue)
	c0 := -1
	c1 := -1
	if colorCount >= 1 {
		c0 = int(colorOrder[0])
	}
	if colorCount >= 2 {
		c1 = int(colorOrder[1])
	}
	isStartActive := func(c uint8) bool {
		return int(c) == c0 || int(c) == c1
	}

	// 2. Place Hidden Pearls on normal tiles that begin blocked OR non-active color (so they start black!)
	if art.MaxHidden > 0 {
		allMask := fullMask(n)
		var hiddenCands [MaxGridTiles]int
		nHid := 0
		for i := 0; i < n; i++ {
			if tiles[i].Special != SpecialNone {
				continue
			}
			unblocked := isUnblockedMask(tiles, allMask, i, art.Cols, art.Rows)
			if !unblocked || !isStartActive(tiles[i].Color) {
				hiddenCands[nHid] = i
				nHid++
			}
		}
		for i := nHid - 1; i > 0; i-- {
			j := rng.intn(i + 1)
			hiddenCands[i], hiddenCands[j] = hiddenCands[j], hiddenCands[i]
		}
		placed := 0
		for k := 0; k < nHid && placed < art.MaxHidden; k++ {
			idx := hiddenCands[k]
			tiles[idx].Special = SpecialHidden
			tiles[idx].Revealed = false
			placed++
		}
	}

	// 3. Place Heart Pearls (capped strictly at 3; 0 = NO hearts!)
	targetHearts := art.MaxHearts
	if targetHearts > MaxHeartsPerLevel {
		targetHearts = MaxHeartsPerLevel
	}
	if targetHearts > 0 {
		var order [MaxGridTiles]int
		for i := 0; i < n; i++ {
			order[i] = i
		}
		for i := n - 1; i > 0; i-- {
			j := rng.intn(i + 1)
			order[i], order[j] = order[j], order[i]
		}
		placed := 0
		// Prefer 1 Heart on a starting active color so players immediately feel the early-placement rush
		for k := 0; k < n && placed == 0 && placed < targetHearts; k++ {
			idx := order[k]
			if tiles[idx].Special == SpecialNone && isStartActive(tiles[idx].Color) {
				tiles[idx].Special = SpecialHeart
				tiles[idx].IsHeart = true
				placed++
			}
		}
		for k := 0; k < n && placed < targetHearts; k++ {
			idx := order[k]
			if tiles[idx].Special != SpecialNone {
				continue
			}
			tiles[idx].Special = SpecialHeart
			tiles[idx].IsHeart = true
			placed++
		}
	}
}

// generateSolvableBoard constructs an engaging, interlocking, 100%-solvable untangle board
// supporting Heart, Rainbow (extra board tile!), Hidden, and Locked pearls, AND mathematically
// verified to have a 3-star winning path (TrayUses <= hoopCount/6)!
func generateSolvableBoard(art ArtworkDef) ([]Tile, [NumColors]uint8, int) {
	colorOrder, colorCount, colorCounts := buildColorOrder(art.Stitches)
	hoopN := len(art.Stitches)
	if hoopN > MaxGridTiles {
		hoopN = MaxGridTiles
	}
	rainbowN := art.MaxRainbows
	if rainbowN < 0 {
		rainbowN = 0
	}
	if rainbowN > 2 {
		rainbowN = 2
	}
	maxBoardCells := art.Cols * art.Rows
	if maxBoardCells > MaxGridTiles {
		maxBoardCells = MaxGridTiles
	}
	if hoopN+rainbowN > maxBoardCells {
		rainbowN = maxBoardCells - hoopN
		if rainbowN < 0 {
			rainbowN = 0
		}
	}
	n := hoopN + rainbowN
	starLimit := ThreeStarTrayLimit(hoopN)

	type cell struct{ c, r int }
	allCells := make([]cell, 0, art.Cols*art.Rows)
	for r := 0; r < art.Rows; r++ {
		for c := 0; c < art.Cols; c++ {
			allCells = append(allCells, cell{c: c, r: r})
		}
	}

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
	for i := 0; i < len(chosen); i++ {
		for j := i + 1; j < len(chosen); j++ {
			if chosen[j].r < chosen[i].r || (chosen[j].r == chosen[i].r && chosen[j].c < chosen[i].c) {
				chosen[i], chosen[j] = chosen[j], chosen[i]
			}
		}
	}

	rng := newPRNG(art.Seed)

	if art.NoBlockers {
		// Sort perimeter-first so every placed cell has an unobstructed outward lane to the board edge!
		for i := 0; i < len(allCells); i++ {
			for j := i + 1; j < len(allCells); j++ {
				ei := min(min(allCells[i].c, art.Cols-1-allCells[i].c), min(allCells[i].r, art.Rows-1-allCells[i].r))
				ej := min(min(allCells[j].c, art.Cols-1-allCells[j].c), min(allCells[j].r, art.Rows-1-allCells[j].r))
				if ej < ei {
					allCells[i], allCells[j] = allCells[j], allCells[i]
				}
			}
		}
		perim := allCells[:n]
		for i := 0; i < len(perim); i++ {
			for j := i + 1; j < len(perim); j++ {
				if perim[j].r < perim[i].r || (perim[j].r == perim[i].r && perim[j].c < perim[i].c) {
					perim[i], perim[j] = perim[j], perim[i]
				}
			}
		}
		tiles := make([]Tile, n)
		peelOrder := make([]int, n)
		for i, cl := range perim {
			tiles[i] = Tile{Col: cl.c, Row: cl.r, Alive: true}
			peelOrder[i] = i
		}
		allMask := fullMask(n)
		for i := 0; i < n; i++ {
			bestDir := uint8(DirUp)
			bestDist := 99
			for d := uint8(0); d < 4; d++ {
				tiles[i].Dir = d
				if isUnblockedMask(tiles, allMask, i, art.Cols, art.Rows) {
					de := distToEdge(tiles[i].Col, tiles[i].Row, art.Cols, art.Rows, d)
					if de < bestDist {
						bestDist = de
						bestDir = d
					}
				}
			}
			tiles[i].Dir = bestDir
		}
		idx := 0
		for qi := 0; qi < colorCount; qi++ {
			c := colorOrder[qi]
			for k := 0; k < colorCounts[c] && idx < n; k++ {
				tiles[idx].Color = c
				idx++
			}
		}
		for i := hoopN - 1; i > 0; i-- {
			j := rng.intn(i + 1)
			tiles[i].Color, tiles[j].Color = tiles[j].Color, tiles[i].Color
		}
		assignSpecialPearls(tiles, peelOrder, art, colorOrder, colorCount, &rng)
		return tiles, colorOrder, colorCount
	}

	diff := art.Difficulty
	if diff < 1 {
		diff = 1
	}
	if diff > 11 {
		diff = 11
	}
	targetMinBlocked := (n * (22 + diff*4)) / 100
	maxCap := (n * 66) / 100
	if targetMinBlocked > maxCap {
		targetMinBlocked = maxCap
	}

	allMask := fullMask(n)

	for attempt := 0; attempt < 96; attempt++ {
		tiles := make([]Tile, n)
		for i, cl := range chosen {
			tiles[i] = Tile{
				Col:   cl.c,
				Row:   cl.r,
				Alive: true,
			}
		}

		alive := allMask
		peelOrder := make([]int, 0, n)

		inwardBiasPct := 38 + diff*6
		if inwardBiasPct > 92 {
			inwardBiasPct = 92
		}

		for len(peelOrder) < n {
			type cand struct {
				idx    int
				dir    uint8
				weight int
			}
			cands := make([]cand, 0, n*2)
			totalW := 0
			for i := 0; i < n; i++ {
				if (alive & (uint64(1) << uint(i))) == 0 {
					continue
				}
				bestDir := uint8(0)
				bestDist := -1
				var validDirs [4]uint8
				vCount := 0
				for d := uint8(0); d < 4; d++ {
					tiles[i].Dir = d
					if isUnblockedMask(tiles, alive, i, art.Cols, art.Rows) {
						validDirs[vCount] = d
						vCount++
						de := distToEdge(tiles[i].Col, tiles[i].Row, art.Cols, art.Rows, d)
						if de > bestDist {
							bestDist = de
							bestDir = d
						}
					}
				}
				if vCount > 0 {
					chosenDir := validDirs[rng.intn(vCount)]
					if rng.intn(100) < inwardBiasPct && bestDist > 0 {
						chosenDir = bestDir
					}
					w := 1 + distToEdge(tiles[i].Col, tiles[i].Row, art.Cols, art.Rows, chosenDir)
					cands = append(cands, cand{idx: i, dir: chosenDir, weight: w})
					totalW += w
				}
			}
			if len(cands) == 0 {
				break
			}
			roll := rng.intn(totalW)
			pick := cands[0]
			acc := 0
			for _, cd := range cands {
				acc += cd.weight
				if roll < acc {
					pick = cd
					break
				}
			}
			tiles[pick.idx].Dir = pick.dir
			alive &^= (uint64(1) << uint(pick.idx))
			peelOrder = append(peelOrder, pick.idx)
		}

		if len(peelOrder) != n {
			continue
		}

		if attempt < 56 {
			blockedCount := 0
			for i := 0; i < n; i++ {
				if !isUnblockedMask(tiles, allMask, i, art.Cols, art.Rows) {
					blockedCount++
				}
			}
			if blockedCount < targetMinBlocked {
				continue
			}
		}

		colorSeq := make([]uint8, 0, hoopN)
		for qi := 0; qi < colorCount; qi++ {
			c := colorOrder[qi]
			for k := 0; k < colorCounts[c]; k++ {
				colorSeq = append(colorSeq, c)
			}
		}

		window := 2 + diff
		if window > 10 {
			window = 10
		}
		swaps := hoopN * (1 + (diff+1)/2)
		if attempt >= 48 {
			window = 2 + diff/2
			swaps = hoopN * 2
		}
		if attempt >= 76 {
			window = 2
			swaps = hoopN
		}
		for s := 0; s < swaps; s++ {
			a := rng.intn(hoopN)
			b := a + rng.intn(window*2+1) - window
			if b >= 0 && b < hoopN && a != b {
				colorSeq[a], colorSeq[b] = colorSeq[b], colorSeq[a]
			}
		}

		// Pick rainbowN well-spaced peel positions in the first 65% of peelOrder for Rainbow Wild Pearls!
		var isRainStep [MaxGridTiles]bool
		if rainbowN > 0 {
			span := (n * 65) / 100
			if span < rainbowN+1 {
				span = n
			}
			for r := 0; r < rainbowN; r++ {
				pos := (span*(r+1))/(rainbowN+1) + rng.intn(3) - 1
				if pos < 0 {
					pos = 0
				}
				if pos >= n {
					pos = n - 1
				}
				for isRainStep[pos] {
					pos = (pos + 1) % n
				}
				isRainStep[pos] = true
			}
		}

		colCursor := 0
		for stepIdx, tileIdx := range peelOrder {
			if isRainStep[stepIdx] {
				tiles[tileIdx].Special = SpecialRainbow
				tiles[tileIdx].Color = colorOrder[0]
			} else {
				tiles[tileIdx].Color = colorSeq[colCursor]
				colCursor++
			}
		}

		// Stamp Locked, Hidden, and Heart pearls onto the board
		assignSpecialPearls(tiles, peelOrder, art, colorOrder, colorCount, &rng)

		// If Locked pearls were requested, ensure at least 1 actually placed on early attempts
		if art.MaxLocked > 0 && attempt < 48 {
			hasLocked := false
			for i := 0; i < n; i++ {
				if tiles[i].Special == SpecialLocked {
					hasLocked = true
					break
				}
			}
			if !hasLocked {
				continue
			}
		}

		st := solverState{
			aliveMask: allMask,
			remain:    colorCounts,
			active:    [ActiveSlots]int{-1, -1},
			queue:     colorOrder,
			queueLen:  colorCount,
			queuePos:  0,
		}
		st.refillActive()

		// Provably verify BOTH 100% solvability AND 3-star achievability with ALL special pearl rules!
		if ok, _ := solveWithTrayBudget(tiles, art.Cols, art.Rows, st, starLimit, 16000); ok {
			return tiles, colorOrder, colorCount
		}
	}

	// Deterministic guaranteed 0-tray-use 3-star fallback (respecting Rainbow extra tiles!)
	tiles := make([]Tile, n)
	peelOrder := make([]int, n)
	for i, cl := range chosen {
		tiles[i] = Tile{Col: cl.c, Row: cl.r, Dir: DirUp, Alive: true}
		peelOrder[i] = i
	}
	idx := 0
	for qi := 0; qi < colorCount; qi++ {
		c := colorOrder[qi]
		for k := 0; k < colorCounts[c] && idx < hoopN; k++ {
			tiles[idx].Color = c
			idx++
		}
	}
	for r := 0; r < rainbowN && idx < n; r++ {
		tiles[idx].Special = SpecialRainbow
		tiles[idx].Color = colorOrder[0]
		idx++
	}
	assignSpecialPearls(tiles, peelOrder, art, colorOrder, colorCount, &rng)
	return tiles, colorOrder, colorCount
}
