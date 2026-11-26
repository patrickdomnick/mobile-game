package sim

import "math"

// IsFinalColorMode returns true when strictly ONE hoop color remains to be stitched while playing.
// The win is effectively in hand: upbeat rush music plays, jiggles & gem highlights stop, flights speed up,
// and tapping any blocked/locked gem queues it silently to auto-resolve as soon as it becomes free!
func (e *Engine) IsFinalColorMode() bool {
	if e.Phase != PhasePlaying || e.HoopCount <= 0 {
		return false
	}
	remColors := 0
	for c := 0; c < NumColors; c++ {
		if e.Remain[c] > 0 {
			remColors++
			if remColors > 1 {
				return false
			}
		}
	}
	return remColors == 1
}

func (e *Engine) clearHighlightsAndJiggles() {
	for c := 0; c < NumColors; c++ {
		e.ColorGlowT[c] = 0
	}
	for i := 0; i < e.TileCount; i++ {
		e.Tiles[i].JiggleT = 0
		e.Tiles[i].JiggleDelay = 0
	}
}

func (e *Engine) isTileQueued(idx int) bool {
	for i := 0; i < e.AutoQueueLen; i++ {
		if e.AutoQueue[i] == idx {
			return true
		}
	}
	return false
}

func (e *Engine) enqueueTile(idx int) {
	if e.isTileQueued(idx) || e.AutoQueueLen >= MaxGridTiles {
		return
	}
	e.AutoQueue[e.AutoQueueLen] = idx
	e.AutoQueueLen++
}

func (e *Engine) removeFromAutoQueue(idx int) {
	w := 0
	for i := 0; i < e.AutoQueueLen; i++ {
		if e.AutoQueue[i] != idx {
			e.AutoQueue[w] = e.AutoQueue[i]
			w++
		}
	}
	e.AutoQueueLen = w
}

func (e *Engine) hasReadyQueuedTile() bool {
	if e.Phase != PhasePlaying || e.AutoQueueLen == 0 {
		return false
	}
	for i := 0; i < e.AutoQueueLen; i++ {
		qIdx := e.AutoQueue[i]
		if qIdx < 0 || qIdx >= e.TileCount || !e.Tiles[qIdx].Alive {
			continue
		}
		if isTileLockedNow(e.Tiles[:e.TileCount], qIdx) {
			continue
		}
		if findFirstBlocker(e.Tiles[:e.TileCount], qIdx, e.GridCols, e.GridRows) < 0 {
			return true
		}
	}
	return false
}

// updateSpecialStates reveals any Hidden Pearl that is now stitchable (unblocked + active color)
// and unlocks any Locked Pearl whose 4 orthogonal adjacent tiles are now empty.
func (e *Engine) updateSpecialStates(silent bool) {
	finalMode := e.IsFinalColorMode()
	for i := 0; i < e.TileCount; i++ {
		t := &e.Tiles[i]
		if !t.Alive {
			continue
		}
		if t.Special == SpecialHidden && !t.Revealed {
			if e.isActiveColor(t.Color) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
				t.Revealed = true
				if !silent {
					if !finalMode {
						t.JiggleDelay = 0
						t.JiggleT = 0.90
					}
					e.HiddenRevealEvents++
				}
			}
		} else if t.Special == SpecialLocked && !t.Unlocked {
			if adjacentAliveDirMask(e.Tiles[:e.TileCount], i) == 0 {
				t.Unlocked = true
				if !silent {
					if !finalMode {
						t.JiggleDelay = 0
						t.JiggleT = 1.0
					}
					e.LockBreakEvents++
					e.addShake(0.30)
				}
			}
		}
	}
}

// pickRainbowTargetColor picks the best currently active stitch color for a Rainbow Wild Pearl.
func (e *Engine) pickRainbowTargetColor() int {
	best := -1
	bestRem := 0
	for i := 0; i < ActiveSlots; i++ {
		c := e.Active[i]
		if c >= 0 && e.Remain[c] > bestRem {
			best = c
			bestRem = e.Remain[c]
		}
	}
	return best
}

// awardHeartBonus grants early-placement bonus points (HeartBonusMax early down to HeartBonusMin late) and triggers the Heart Chime!
func (e *Engine) awardHeartBonus(wx, wz float32) {
	e.ensureTuningDefaults()
	remTotal := 0
	for c := 0; c < NumColors; c++ {
		remTotal += e.Remain[c]
	}
	denom := e.HoopCount
	if denom < 1 {
		denom = 1
	}
	ratio := float32(remTotal+1) / float32(denom)
	if ratio > 1.0 {
		ratio = 1.0
	}
	minB := e.Tuning.HeartBonusMin
	maxB := e.Tuning.HeartBonusMax
	if maxB < minB {
		maxB = minB
	}
	span := float64(maxB - minB)
	bonus := minB + uint32(math.Round(float64(ratio)*span))
	e.Score += bonus
	e.LastScoreDelta += bonus
	e.LastHeartBonus = bonus
	e.HeartClearEvents++
	e.LastEventWorldX = wx
	e.LastEventWorldZ = wz
	e.addShake(0.34)
}

// SetTimeOfDayHours updates the continuous 24-hour real-world solar clock [0, 24).
func (e *Engine) SetTimeOfDayHours(hours float32) {
	h := float32(math.Mod(float64(hours), 24.0))
	if h < 0 {
		h += 24.0
	}
	e.TimeOfDayHours = h
	e.syncBuffers()
}

func (e *Engine) currentMultiplier() uint32 {
	m := uint32(1) + e.Streak
	if m > 12 {
		m = 12
	}
	return m
}

func (e *Engine) addShake(amount float32) {
	e.ensureTuningDefaults()
	scaled := amount * e.Tuning.ShakeIntensity
	if scaled > e.ShakeAmt {
		e.ShakeAmt = scaled
	}
	if e.ShakeAmt > 1.0 {
		e.ShakeAmt = 1.0
	}
}

func (e *Engine) tileWorldPos(col, row int) (float32, float32) {
	halfC := float32(e.GridCols-1) * 0.5
	halfR := float32(e.GridRows-1) * 0.5
	wx := BoardCenterX + (float32(col)-halfC)*e.CellPitch
	wz := BoardCenterZ + (float32(row)-halfR)*e.CellPitch
	return wx, wz
}

func (e *Engine) traySlotWorldPos(slot int) (float32, float32) {
	half := float32(TrayCapacity-1) * 0.5
	wx := (float32(slot) - half) * TraySpacing
	return wx, TrayCenterZ
}

func (e *Engine) nextQueuedColor() int {
	for pos := e.QueuePos; pos < e.QueueLen; pos++ {
		c := int(e.ColorQueue[pos])
		if e.Remain[c] > 0 {
			return c
		}
	}
	return -1
}

// triggerColorJiggle queues a calm, playful wiggle on ONLY visible alive board pearls of color c.
// Never wiggles concealed Hidden pearls (zero color spoiler!), Rainbow pearls, or during Final-Color Mode!
func (e *Engine) triggerColorJiggle(color uint8, delay float32) {
	if e.IsFinalColorMode() {
		return
	}
	for i := 0; i < e.TileCount; i++ {
		t := &e.Tiles[i]
		if !t.Alive || t.Special == SpecialRainbow || (t.Special == SpecialHidden && !t.Revealed) {
			continue
		}
		if t.Color == color {
			if delay > 0 {
				t.JiggleDelay = delay
				t.JiggleT = 0
			} else {
				t.JiggleDelay = 0
				t.JiggleT = 1.0
			}
		}
	}
}

// TriggerRandomActiveWiggle picks 1 random visible alive pearl matching ANY currently active stitch color OR an alive
// Heart Pearl (completely ignoring blocked/unblocked for 100% zero-spoiler fairness!) and gives it a gentle wiggle.
// Automatically suppressed once only 1 color remains (Final-Color Mode).
func (e *Engine) TriggerRandomActiveWiggle() int {
	if e.Phase != PhasePlaying || e.IsFinalColorMode() {
		return -1
	}
	var activeCands [MaxGridTiles]int
	nActive := 0
	var heartCands [MaxGridTiles]int
	nHeart := 0
	for i := 0; i < e.TileCount; i++ {
		t := e.Tiles[i]
		if !t.Alive || t.Special == SpecialRainbow || (t.Special == SpecialHidden && !t.Revealed) {
			continue
		}
		if e.isActiveColor(t.Color) {
			activeCands[nActive] = i
			nActive++
		}
		if t.IsHeart {
			heartCands[nHeart] = i
			nHeart++
		}
	}

	useHeart := nHeart > 0 && (nActive == 0 || e.wiggleRng.intn(100) < 42)
	var pool []int
	if useHeart {
		pool = heartCands[:nHeart]
	} else {
		pool = activeCands[:nActive]
	}
	n := len(pool)
	if n == 0 {
		return -1
	}
	pick := pool[e.wiggleRng.intn(n)]
	if n > 1 && pick == e.lastWiggleIdx {
		pick = pool[(e.wiggleRng.intn(n-1)+1)%n]
		if pick == e.lastWiggleIdx {
			for k := 0; k < n; k++ {
				if pool[k] != e.lastWiggleIdx {
					pick = pool[k]
					break
				}
			}
		}
	}
	e.lastWiggleIdx = pick
	e.Tiles[pick].JiggleDelay = 0
	e.Tiles[pick].JiggleT = 1.0
	e.syncBuffers()
	return pick
}

// TriggerRandomRainbowWiggle independently wiggles an alive Rainbow Wild Pearl on its own cadence!
// Automatically suppressed in Final-Color Mode.
func (e *Engine) TriggerRandomRainbowWiggle() int {
	if e.Phase != PhasePlaying || e.IsFinalColorMode() {
		return -1
	}
	var cands [MaxGridTiles]int
	n := 0
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive && e.Tiles[i].Special == SpecialRainbow {
			cands[n] = i
			n++
		}
	}
	if n == 0 {
		return -1
	}
	pick := cands[e.wiggleRng.intn(n)]
	if n > 1 && pick == e.lastRainbowWiggleIdx {
		pick = cands[(e.wiggleRng.intn(n-1)+1)%n]
	}
	e.lastRainbowWiggleIdx = pick
	e.Tiles[pick].JiggleDelay = 0
	e.Tiles[pick].JiggleT = 1.0
	e.syncBuffers()
	return pick
}

// refillActiveColors fills up to 2 active stitch slots during gameplay with the configured unlock delay.
func (e *Engine) refillActiveColors() {
	e.ensureTuningDefaults()
	e.refillActiveColorsWithDelay(e.Tuning.UnlockDelaySec)
}

// refillActiveColorsWithDelay fills up to 2 active stitch slots, EXCEPT the very last color in the queue
// is held back until the penultimate color is 100% completed (so the final two colors unlock separately!).
// Once only 1 color remains (Final-Color Mode), all highlights & jiggles are cleared immediately.
func (e *Engine) refillActiveColorsWithDelay(jiggleDelay float32) {
	activeAlive := 0
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] >= 0 && e.Remain[e.Active[i]] > 0 {
			activeAlive++
		} else {
			e.Active[i] = -1
		}
	}

	finalMode := e.IsFinalColorMode()
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] >= 0 {
			continue
		}
		for e.QueuePos < e.QueueLen {
			c := int(e.ColorQueue[e.QueuePos])
			if e.Remain[c] <= 0 {
				e.QueuePos++
				continue
			}
			isFinalColor := e.QueueLen >= 3 && e.QueuePos == e.QueueLen-1
			if isFinalColor && activeAlive > 0 {
				return
			}
			e.QueuePos++
			e.Active[i] = c
			if !finalMode {
				e.ColorGlowT[c] = 1.0
				e.triggerColorJiggle(uint8(c), jiggleDelay)
			}
			activeAlive++
			break
		}
	}

	if finalMode {
		e.clearHighlightsAndJiggles()
	}
}

func (e *Engine) isActiveColor(c uint8) bool {
	for i := 0; i < ActiveSlots; i++ {
		if e.Active[i] == int(c) && e.Remain[c] > 0 {
			return true
		}
	}
	return false
}

func (e *Engine) claimHoopSlot(color uint8) int {
	// Prefer earliest incomplete layer so embroidery visually builds inside-out layer by layer!
	for targetLayer := uint8(0); targetLayer < MaxLayers; targetLayer++ {
		for i := 0; i < e.HoopCount; i++ {
			if !e.HoopPearls[i].Claimed && e.HoopPearls[i].Color == color && e.HoopPearls[i].Layer == targetLayer {
				e.HoopPearls[i].Claimed = true
				return i
			}
		}
	}
	for i := 0; i < e.HoopCount; i++ {
		if !e.HoopPearls[i].Claimed && e.HoopPearls[i].Color == color {
			e.HoopPearls[i].Claimed = true
			return i
		}
	}
	return -1
}

func (e *Engine) checkLayerMilestones() {
	doneCount := 0
	for l := 0; l < MaxLayers; l++ {
		if e.LayerTotal[l] == 0 {
			continue
		}
		allClaimed := true
		for i := 0; i < e.HoopCount; i++ {
			if int(e.HoopPearls[i].Layer) == l && !e.HoopPearls[i].Claimed {
				allClaimed = false
				break
			}
		}
		if allClaimed {
			doneCount++
			if !e.LayerDone[l] {
				e.LayerDone[l] = true
				e.Score += 750
				e.LastScoreDelta += 750
				e.LayerBurstPulse = 1.0
				e.LayerClearEvents++
				e.addShake(0.82)
				// Shimmer every pearl in the newly completed layer!
				for i := 0; i < e.HoopCount; i++ {
					if int(e.HoopPearls[i].Layer) == l {
						e.HoopPearls[i].ShimmerPulse = 1.0
					}
				}
			}
		}
	}
	e.LayersComplete = doneCount
}

func (e *Engine) triggerColorCleared(color uint8) {
	e.Score += 500
	e.LastScoreDelta += 500
	e.ColorBurstPulse = 1.0
	e.ColorBurstColor = int(color)
	e.ColorClearEvents++
	e.LastColorCleared = uint32(color)
	e.addShake(0.58)
	// Ripple shimmer across all hoop pearls of this completed color
	for i := 0; i < e.HoopCount; i++ {
		if e.HoopPearls[i].Color == color {
			e.HoopPearls[i].ShimmerPulse = 1.0
		}
	}
}

// spawnFlight launches a pearl along a graceful quadratic Bezier arc.
// When launchDX/launchDZ are non-zero (freed board tile), the initial tangent visibly
// slides outward along the tile's arrow direction before sweeping smoothly into the hoop or tray!
func (e *Engine) spawnFlight(color uint8, special uint8, sx, sy, sz, ex, ey, ez float32, launchDX, launchDZ float32, delay float32, toHoop bool, targetIdx int) {
	slot := -1
	for i := range e.Flying {
		if !e.Flying[i].Active {
			slot = i
			break
		}
	}
	if slot < 0 {
		if toHoop && targetIdx >= 0 && targetIdx < e.HoopCount {
			e.HoopPearls[targetIdx].Stitched = true
			e.HoopPearls[targetIdx].BloomT = 1.0
			e.HoopPearls[targetIdx].ShimmerPulse = 1.0
		}
		return
	}

	var ctrlX, ctrlZ float32
	if launchDX != 0 || launchDZ != 0 {
		slide := e.CellPitch * 1.15
		if !toHoop {
			slide = e.CellPitch * 0.85
		}
		ctrlX = sx + launchDX*slide + (ex-sx)*0.32
		ctrlZ = sz + launchDZ*slide + (ez-sz)*0.32
	} else {
		ctrlX = (sx+ex)*0.5 + (ex-sx)*0.14
		ctrlZ = (sz + ez) * 0.5
	}
	ctrlY := float32(1.48)
	if !toHoop {
		ctrlY = 0.82
	}
	dur := float32(0.31)
	if e.IsFinalColorMode() {
		dur = 0.16
		if toHoop {
			ctrlY = 1.12
		}
	}

	e.Flying[slot] = FlyingPearl{
		Active:      true,
		Color:       color,
		Special:     special,
		StartX:      sx,
		StartY:      sy,
		StartZ:      sz,
		CtrlX:       ctrlX,
		CtrlY:       ctrlY,
		CtrlZ:       ctrlZ,
		EndX:        ex,
		EndY:        ey,
		EndZ:        ez,
		Progress:    0,
		Delay:       delay,
		Duration:    dur,
		ToHoop:      toHoop,
		TargetIndex: targetIdx,
	}
}

func (e *Engine) captureUndoSnapshot() undoSnapshot {
	var aliveMask, revealedMask, unlockedMask uint64
	for i := 0; i < e.TileCount; i++ {
		bit := uint64(1) << uint(i)
		if e.Tiles[i].Alive {
			aliveMask |= bit
		}
		if e.Tiles[i].Revealed {
			revealedMask |= bit
		}
		if e.Tiles[i].Unlocked {
			unlockedMask |= bit
		}
	}
	var claimedMask uint64
	for i := 0; i < e.HoopCount; i++ {
		if e.HoopPearls[i].Claimed {
			claimedMask |= (uint64(1) << uint(i))
		}
	}
	return undoSnapshot{
		aliveMask:    aliveMask,
		claimedMask:  claimedMask,
		revealedMask: revealedMask,
		unlockedMask: unlockedMask,
		tray:         e.Tray,
		trayHeart:    e.TrayHeart,
		trayLen:      e.TrayLen,
		remain:       e.Remain,
		active:       e.Active,
		queuePos:     e.QueuePos,
		score:        e.Score,
		streak:       e.Streak,
		directCount:  e.DirectCount,
		trayUses:     e.TrayUses,
		layerDone:    e.LayerDone,
		phase:        e.Phase,
	}
}

func (e *Engine) drainTrayToHoop() {
	stagger := float32(0.055)
	staggerStep := float32(0.055)
	if e.IsFinalColorMode() {
		stagger = 0.025
		staggerStep = 0.030
	}
	for {
		progressed := false
		writeIdx := 0
		for i := 0; i < e.TrayLen; i++ {
			c := e.Tray[i]
			isH := e.TrayHeart[i]
			if e.isActiveColor(c) {
				hoopIdx := e.claimHoopSlot(c)
				if hoopIdx >= 0 {
					sx, sz := e.traySlotWorldPos(i)
					hp := &e.HoopPearls[hoopIdx]
					sp := SpecialNone
					if isH {
						sp = SpecialHeart
					}
					e.spawnFlight(c, sp, sx, 0.22, sz, hp.WorldX, 0.14, hp.WorldZ, 0, 0, stagger, true, hoopIdx)
					stagger += staggerStep
					e.Remain[c]--
					e.Streak++
					if e.Streak > e.MaxStreak {
						e.MaxStreak = e.Streak
					}
					pts := uint32(125) * e.currentMultiplier()
					e.Score += pts
					e.LastScoreDelta += pts
					e.LastEventWorldX = hp.WorldX
					e.LastEventWorldZ = hp.WorldZ
					e.StitchEvents++
					e.CascadeEvents++
					e.LastStitchCol = uint32(c)
					e.addShake(0.28 + float32(e.currentMultiplier())*0.03)
					if isH {
						e.awardHeartBonus(hp.WorldX, hp.WorldZ)
					}
					if e.Remain[c] == 0 {
						e.triggerColorCleared(c)
					}
					e.checkLayerMilestones()
					progressed = true
					continue
				}
			}
			e.Tray[writeIdx] = c
			e.TrayHeart[writeIdx] = isH
			writeIdx++
		}
		for k := writeIdx; k < TrayCapacity; k++ {
			e.TrayHeart[k] = false
		}
		e.TrayLen = writeIdx
		if progressed {
			e.refillActiveColors()
		} else {
			break
		}
	}
}

func (e *Engine) updatePhase() {
	allClaimed := true
	for i := 0; i < e.HoopCount; i++ {
		if !e.HoopPearls[i].Claimed {
			allClaimed = false
			break
		}
	}
	if allClaimed && e.HoopCount > 0 {
		if e.Phase != PhaseComplete {
			e.Phase = PhaseComplete
			e.AutoQueueLen = 0
			e.AutoQueueCooldown = 0
			e.CelebrateT = 1.0
			e.addShake(0.92)
			if e.TrayUses == 0 {
				e.Score += 1500
				e.LastScoreDelta += 1500
			}
			if e.UndoUsed == 0 && e.HintsUsed == 0 {
				e.Score += 750
				e.LastScoreDelta += 750
			}
			if e.UndoUsed == 0 && e.HintsUsed == 0 && e.TrayUses <= ThreeStarTrayLimit(e.HoopCount) {
				e.Stars = 3
			} else if e.TrayUses <= e.HoopCount/3 {
				e.Stars = 2
			} else {
				e.Stars = 1
			}
			e.CompleteEvents++
		}
		return
	}

	if e.TrayLen >= TrayCapacity {
		hasDirect := false
		for i := 0; i < e.TileCount; i++ {
			t := e.Tiles[i]
			if !t.Alive || isTileLockedNow(e.Tiles[:e.TileCount], i) {
				continue
			}
			if (t.Special == SpecialRainbow || e.isActiveColor(t.Color)) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
				hasDirect = true
				break
			}
		}
		if !hasDirect {
			e.Phase = PhaseTrayFull
			return
		}
	}
	e.Phase = PhasePlaying
}

func (e *Engine) computeTrayTension() float32 {
	switch e.TrayLen {
	case 0, 1, 2:
		return 0.0
	case 3:
		return 0.35
	case 4:
		return 0.72
	default:
		return 1.0
	}
}

// TapWorld maps a world-space XZ tap on the board plane to the nearest alive tile.
func (e *Engine) TapWorld(wx, wz float32) bool {
	bestIdx := -1
	bestDistSq := (e.CellPitch * 0.56) * (e.CellPitch * 0.56)
	for i := 0; i < e.TileCount; i++ {
		if !e.Tiles[i].Alive {
			continue
		}
		tx, tz := e.tileWorldPos(e.Tiles[i].Col, e.Tiles[i].Row)
		dx := wx - tx
		dz := wz - tz
		d2 := dx*dx + dz*dz
		if d2 < bestDistSq {
			bestDistSq = d2
			bestIdx = i
		}
	}
	if bestIdx < 0 {
		return false
	}
	return e.TapTile(bestIdx)
}

// TapTile attempts to untangle tile idx. Returns true if the tile was freed (or queued in Final-Color Mode).
func (e *Engine) TapTile(idx int) bool {
	if e.IntroActive || e.Phase == PhaseComplete || idx < 0 || idx >= e.TileCount || !e.Tiles[idx].Alive {
		return false
	}

	finalMode := e.IsFinalColorMode()

	// 1. Check Locked Pearl rule FIRST: cannot be used while ANY of the 4 orthogonal adjacent cells holds an alive pearl!
	if isTileLockedNow(e.Tiles[:e.TileCount], idx) {
		if finalMode {
			// In Final-Color Victory Rush Mode: zero error! Silently queue it to auto-resolve the moment it unlocks!
			e.enqueueTile(idx)
			e.QueueEvents++
			e.syncBuffers()
			return true
		}
		adj := findFirstAdjacentAlive(e.Tiles[:e.TileCount], idx)
		e.Tiles[idx].WobbleT = 1.0
		if adj >= 0 {
			e.Tiles[adj].WobbleT = 0.75
		}
		e.LastTappedBlockedIdx = idx
		e.LastBlockerIdx = adj
		e.BlockerFlashT = 1.0
		e.addShake(0.20)
		e.LockedTapEvents++
		e.syncBuffers()
		return false
	}

	// 2. Check directional arrow lane blocker
	blocker := findFirstBlocker(e.Tiles[:e.TileCount], idx, e.GridCols, e.GridRows)
	if blocker >= 0 {
		if finalMode {
			// In Final-Color Victory Rush Mode: zero error! Silently queue it to auto-resolve as soon as its lane opens!
			e.enqueueTile(idx)
			e.QueueEvents++
			e.syncBuffers()
			return true
		}
		e.Tiles[idx].WobbleT = 1.0
		e.Tiles[blocker].WobbleT = 0.65
		e.LastTappedBlockedIdx = idx
		e.LastBlockerIdx = blocker
		e.BlockerFlashT = 1.0
		e.addShake(0.18)
		e.BlockedEvents++
		e.syncBuffers()
		return false
	}

	isRainbow := e.Tiles[idx].Special == SpecialRainbow
	color := e.Tiles[idx].Color
	direct := false
	if isRainbow {
		rc := e.pickRainbowTargetColor()
		if rc >= 0 {
			color = uint8(rc)
			direct = true
		}
	} else {
		direct = e.isActiveColor(color)
	}

	if !direct && e.TrayLen >= TrayCapacity {
		e.Tiles[idx].WobbleT = 1.0
		e.LastTappedBlockedIdx = idx
		e.LastBlockerIdx = -1
		e.BlockerFlashT = 0.75
		e.addShake(0.24)
		e.BlockedEvents++
		e.updatePhase()
		e.syncBuffers()
		return false
	}

	e.undoStack = append(e.undoStack, e.captureUndoSnapshot())
	e.removeFromAutoQueue(idx)
	e.LastScoreDelta = 0
	e.LastTappedBlockedIdx = -1
	e.LastBlockerIdx = -1
	e.BlockerFlashT = 0

	sx, sz := e.tileWorldPos(e.Tiles[idx].Col, e.Tiles[idx].Row)
	launchDX, launchDZ := float32(0), float32(0)
	switch e.Tiles[idx].Dir {
	case DirUp:
		launchDZ = -1.0
	case DirRight:
		launchDX = 1.0
	case DirDown:
		launchDZ = 1.0
	case DirLeft:
		launchDX = -1.0
	}

	isHeart := e.Tiles[idx].IsHeart
	specialKind := e.Tiles[idx].Special
	if specialKind == SpecialHidden {
		e.Tiles[idx].Revealed = true
	}
	e.Tiles[idx].Alive = false
	e.Tiles[idx].WobbleT = 0
	e.Tiles[idx].JiggleT = 0
	e.Tiles[idx].JiggleDelay = 0
	e.HintTileIdx = -1
	e.HintPulse = 0

	if direct {
		hoopIdx := e.claimHoopSlot(color)
		if hoopIdx >= 0 {
			hp := &e.HoopPearls[hoopIdx]
			e.spawnFlight(color, specialKind, sx, 0.22, sz, hp.WorldX, 0.14, hp.WorldZ, launchDX, launchDZ, 0, true, hoopIdx)
			e.Remain[color]--
			e.DirectCount++
			e.Streak++
			if e.Streak > e.MaxStreak {
				e.MaxStreak = e.Streak
			}
			pts := uint32(100) * e.currentMultiplier()
			if isRainbow {
				pts += 250
				e.RainbowClearEvents++
			}
			e.Score += pts
			e.LastScoreDelta += pts
			e.LastEventWorldX = hp.WorldX
			e.LastEventWorldZ = hp.WorldZ
			e.StitchEvents++
			e.LastStitchCol = uint32(color)
			e.addShake(0.16 + float32(e.currentMultiplier())*0.025)

			if isHeart {
				e.awardHeartBonus(hp.WorldX, hp.WorldZ)
			}
			if e.Remain[color] == 0 {
				e.triggerColorCleared(color)
			}
			e.checkLayerMilestones()
			e.refillActiveColors()
			e.drainTrayToHoop()
		}
	} else {
		slot := e.TrayLen
		e.Tray[slot] = color
		e.TrayHeart[slot] = isHeart
		e.TrayLen++
		e.TrayUses++
		e.Streak = 0
		e.TrayPulse[slot] = 1.0
		ex, ez := e.traySlotWorldPos(slot)
		e.LastEventWorldX = ex
		e.LastEventWorldZ = ez
		e.spawnFlight(color, specialKind, sx, 0.22, sz, ex, 0.20, ez, launchDX, launchDZ, 0, false, slot)
		e.TrayEvents++
		e.drainTrayToHoop()
	}

	// Reveal newly stitchable Hidden pearls & break open newly freed Locked pearls!
	e.updateSpecialStates(false)
	if e.IsFinalColorMode() {
		e.clearHighlightsAndJiggles()
	}
	e.updatePhase()
	if e.AutoQueueLen > 0 && e.Phase == PhasePlaying && e.AutoQueueCooldown <= 0 {
		// Short 45ms beat before firing the next newly-freed queued gem in domino rhythm!
		e.AutoQueueCooldown = 0.045
	}
	e.syncBuffers()
	return true
}

// Undo cleanly reverts the previous move (limitless, deducts Tuning.UndoPenalty and resets active streak).
func (e *Engine) Undo() bool {
	if len(e.undoStack) == 0 {
		return false
	}
	e.ensureTuningDefaults()
	snap := e.undoStack[len(e.undoStack)-1]
	e.undoStack = e.undoStack[:len(e.undoStack)-1]

	for i := 0; i < e.TileCount; i++ {
		bit := uint64(1) << uint(i)
		e.Tiles[i].Alive = (snap.aliveMask & bit) != 0
		e.Tiles[i].Revealed = (snap.revealedMask & bit) != 0
		e.Tiles[i].Unlocked = (snap.unlockedMask & bit) != 0
		e.Tiles[i].WobbleT = 0
		e.Tiles[i].JiggleT = 0
		e.Tiles[i].JiggleDelay = 0
	}
	for i := 0; i < e.HoopCount; i++ {
		claimed := (snap.claimedMask & (uint64(1) << uint(i))) != 0
		e.HoopPearls[i].Claimed = claimed
		e.HoopPearls[i].Stitched = claimed
		if claimed {
			e.HoopPearls[i].BloomT = 1.0
		} else {
			e.HoopPearls[i].BloomT = 0
		}
		e.HoopPearls[i].ShimmerPulse = 0
	}
	for i := range e.Flying {
		e.Flying[i].Active = false
	}

	e.Tray = snap.tray
	e.TrayHeart = snap.trayHeart
	e.TrayLen = snap.trayLen
	e.Remain = snap.remain
	e.Active = snap.active
	e.QueuePos = snap.queuePos
	e.AutoQueueLen = 0
	e.AutoQueueCooldown = 0
	undoPen := e.Tuning.UndoPenalty
	if snap.score > undoPen {
		e.Score = snap.score - undoPen
	} else {
		e.Score = 0
	}
	e.Streak = 0
	e.DirectCount = snap.directCount
	e.TrayUses = snap.trayUses
	e.LayerDone = snap.layerDone
	e.Phase = snap.phase
	e.UndoUsed++
	e.LastPenaltyDelta = undoPen
	e.LayersComplete = 0
	for l := 0; l < MaxLayers; l++ {
		if e.LayerDone[l] {
			e.LayersComplete++
		}
	}
	e.HintTileIdx = -1
	e.HintPulse = 0
	e.CelebrateT = 0
	e.LastTappedBlockedIdx = -1
	e.LastBlockerIdx = -1
	e.BlockerFlashT = 0
	e.UndoEvents++

	e.syncBuffers()
	return true
}

// ComputeHint finds the mathematically optimal next tile on the best path to victory
// using iterative-deepening minimum-tray-cost search (NEVER sabotages the player with an unverified move!).
// Limitless in use: deducts Tuning.HintPenalty on each new highlighted hint.
// Returns HintNeedsUndo (-2) with ZERO penalty if the current board is in a dead-end pinch requiring Undo!
func (e *Engine) ComputeHint() int {
	if e.Phase == PhaseComplete {
		return -1
	}
	e.ensureTuningDefaults()
	hintPen := e.Tuning.HintPenalty

	var aliveMask uint64
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive {
			aliveMask |= (uint64(1) << uint(i))
		}
	}

	st := solverState{
		aliveMask: aliveMask,
		tray:      e.Tray,
		trayLen:   e.TrayLen,
		trayUses:  e.TrayUses,
		remain:    e.Remain,
		active:    e.Active,
		queue:     e.ColorQueue,
		queueLen:  e.QueueLen,
		queuePos:  e.QueuePos,
	}

	ok, bestMove, _ := solveOptimalHint(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st)

	if ok && bestMove >= 0 {
		if bestMove != e.HintTileIdx {
			if e.Score > hintPen {
				e.Score -= hintPen
			} else {
				e.Score = 0
			}
			e.HintsUsed++
			e.LastPenaltyDelta = hintPen
		} else {
			e.LastPenaltyDelta = 0
		}
		e.HintTileIdx = bestMove
		e.HintPulse = 1.0
		e.HintEvents++
		e.syncBuffers()
		return bestMove
	}

	// No verified winning path exists from this board state -> cleanly guide the player to Undo!
	e.HintTileIdx = HintNeedsUndo
	e.HintPulse = 1.0
	e.LastPenaltyDelta = 0
	e.HintEvents++
	e.syncBuffers()
	return HintNeedsUndo
}
