package sim

import (
	"math"
	"testing"
)

func TestAll52CampaignArtworksSolvableZeroBlockerWarmupsAndThreeStar(t *testing.T) {
	if len(CuratedArtworks) != NumChapters*LevelsPerChapter {
		t.Fatalf("expected %d curated artworks (4 campaigns x 13), got %d", NumChapters*LevelsPerChapter, len(CuratedArtworks))
	}

	var e Engine
	e.SetTimeOfDayHours(12.5)

	for lvlIdx, art := range CuratedArtworks {
		tierIdx := lvlIdx % LevelsPerChapter
		e.LoadCuratedLevel(lvlIdx)
		if e.ThemeIndex != art.Theme {
			t.Fatalf("level %d (%s): expected native theme %d, got %d", lvlIdx, art.Name, art.Theme, e.ThemeIndex)
		}
		if e.ChapterIndex != art.Chapter {
			t.Fatalf("level %d (%s): expected chapter %d, got %d", lvlIdx, art.Name, art.Chapter, e.ChapterIndex)
		}

		// Verify L1-L2 zero-blocker warmups vs L3-L13 monotonically increasing difficulty!
		blockedCount := 0
		for i := 0; i < e.TileCount; i++ {
			if !isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
				blockedCount++
			}
		}
		if tierIdx < 2 {
			if !art.NoBlockers || blockedCount != 0 {
				t.Fatalf("campaign %d warm-up level %d (%s): expected NoBlockers=true and 0 blocked tiles, got NoBlockers=%v blocked=%d", art.Chapter, tierIdx+1, art.Name, art.NoBlockers, blockedCount)
			}
		} else {
			if art.Difficulty != tierIdx-1 {
				t.Fatalf("campaign %d level %d (%s): expected monotonic difficulty %d, got %d", art.Chapter, tierIdx+1, art.Name, tierIdx-1, art.Difficulty)
			}
			if blockedCount == 0 {
				t.Fatalf("campaign %d level %d (%s): expected interlocking blocked tiles on non-warmup board", art.Chapter, tierIdx+1, art.Name)
			}
		}

		hearts := 0
		for i := 0; i < e.TileCount; i++ {
			if e.Tiles[i].IsHeart {
				hearts++
			}
		}
		if hearts < 1 || hearts > MaxHeartsPerLevel {
			t.Fatalf("level %d (%s): expected 1..%d Heart Pearls, got %d", lvlIdx, art.Name, MaxHeartsPerLevel, hearts)
		}

		starLimit := ThreeStarTrayLimit(e.HoopCount)
		for step := 0; step < 96 && e.Phase != PhaseComplete; step++ {
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
			ok, mv := solveWithTrayBudget(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, starLimit, 20000)
			if !ok || mv < 0 {
				t.Fatalf("level %d (%s, %dx%d): no 3-star winning move at step %d (trayUses=%d/%d)", lvlIdx, art.Name, art.Cols, art.Rows, step, e.TrayUses, starLimit)
			}
			if !e.TapTile(mv) {
				t.Fatalf("level %d (%s): TapTile(%d) failed", lvlIdx, art.Name, mv)
			}
		}

		for i := 0; i < 260; i++ {
			e.Step(FixedDT)
		}
		if e.Phase != PhaseComplete {
			t.Fatalf("level %d (%s): expected PhaseComplete, got %d", lvlIdx, art.Name, e.Phase)
		}
		if e.Stars != 3 {
			t.Fatalf("level %d (%s): expected guaranteed 3 stars, got %d (trayUses=%d limit=%d)", lvlIdx, art.Name, e.Stars, e.TrayUses, starLimit)
		}
	}
	t.Logf("All %d campaign artworks across %d Campaigns (5x5 warmups -> 8x8 64-pearl finales) mathematically verified 100%% 3-STAR achievable!", len(CuratedArtworks), NumChapters)
}

func TestSoloFinaleLastTwoColorsUnlockSeparatelyAndTemporarySpotlight(t *testing.T) {
	var e Engine
	// Level 2 (Jewel Heart) has exactly 4 colors: C0, C1, C2, C3
	e.LoadCuratedLevel(2)
	if e.QueueLen != 4 {
		t.Fatalf("expected 4 colors on Jewel Heart, got %d", e.QueueLen)
	}
	c0 := int(e.ColorQueue[0])
	c1 := int(e.ColorQueue[1])
	c2 := int(e.ColorQueue[2])
	c3 := int(e.ColorQueue[3])

	// At game start: C0 & C1 are active and glowing; wiggles are delayed (+0.70s) so the board breathes cleanly first!
	if e.Active[0] != c0 || e.Active[1] != c1 {
		t.Fatalf("expected initial active [%d,%d], got [%d,%d]", c0, c1, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c0] < 0.99 || e.ColorGlowT[c1] < 0.99 || e.ColorGlowT[c2] != 0 || e.ColorGlowT[c3] != 0 {
		t.Fatalf("expected initial interior glow only on C0/C1, got %v", e.ColorGlowT)
	}
	for i := 0; i < e.TileCount; i++ {
		c := int(e.Tiles[i].Color)
		if c == c0 || c == c1 {
			if e.Tiles[i].JiggleT != 0 || e.Tiles[i].JiggleDelay < 0.60 {
				t.Fatalf("expected active start tile %d (color %d) to delay wiggle cleanly (JiggleT=%v Delay=%v)", i, c, e.Tiles[i].JiggleT, e.Tiles[i].JiggleDelay)
			}
		} else if e.Tiles[i].JiggleT != 0 || e.Tiles[i].JiggleDelay != 0 {
			t.Fatalf("locked tile %d (color %d) must NOT wiggle or queue wiggle on load", i, c)
		}
	}
	if e.Scene[63] < 0.99 {
		t.Fatalf("expected Scene[63] max glow signal == 1.0 at start, got %v", e.Scene[63])
	}

	// After 0.75s (45 ticks), the delayed load wiggle fires ONLY on active colors C0 & C1!
	for i := 0; i < 45; i++ {
		e.Step(FixedDT)
	}
	for i := 0; i < e.TileCount; i++ {
		c := int(e.Tiles[i].Color)
		if c == c0 || c == c1 {
			if e.Tiles[i].JiggleT < 0.80 {
				t.Fatalf("expected delayed load wiggle active on tile %d (color %d) at 0.75s, got JiggleT=%v", i, c, e.Tiles[i].JiggleT)
			}
		} else if e.Tiles[i].JiggleT != 0 {
			t.Fatalf("locked tile %d (color %d) must remain completely still at 0.75s", i, c)
		}
	}

	// At 1.5s (45 more ticks = 90 total), the 3.5s interior pulse MUST still be active (>= 0.50), while initial wiggle already settled!
	for i := 0; i < 45; i++ {
		e.Step(FixedDT)
	}
	if e.ColorGlowT[c0] < 0.50 || e.Scene[63] < 0.50 {
		t.Fatalf("expected 3.5s interior glow still active at 1.5s, got glow=%v scene63=%v", e.ColorGlowT[c0], e.Scene[63])
	}
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].JiggleT != 0 || e.Tiles[i].JiggleDelay != 0 {
			t.Fatalf("expected initial delayed wiggle to finish before 1.5s, tile %d has JiggleT=%v Delay=%v", i, e.Tiles[i].JiggleT, e.Tiles[i].JiggleDelay)
		}
	}

	// Step another 2.25s (total 3.75s) -> temporary glow fades completely to 0 so GPU sleeps at 0 FPS!
	for i := 0; i < 135; i++ {
		e.Step(FixedDT)
	}
	if e.ColorGlowT[c0] != 0 || e.ColorGlowT[c1] != 0 || e.Scene[63] != 0 {
		t.Fatalf("expected 3.5s start glow to settle to 0, got %v scene63=%v", e.ColorGlowT, e.Scene[63])
	}
	if e.IsAnimating() {
		t.Fatalf("expected IsAnimating() == false once start spotlight finishes (for 0-FPS battery idle)")
	}

	// Periodic random wiggle picks ONLY an alive active-color pearl OR an alive Heart Pearl and settles cleanly!
	for k := 0; k < 8; k++ {
		idx := e.TriggerRandomActiveWiggle()
		if idx < 0 || !e.Tiles[idx].Alive || (!e.isActiveColor(e.Tiles[idx].Color) && !e.Tiles[idx].IsHeart) {
			t.Fatalf("TriggerRandomActiveWiggle picked invalid tile %d", idx)
		}
		if e.Tiles[idx].JiggleT < 0.99 || !e.IsAnimating() {
			t.Fatalf("expected wiggling tile %d to trigger IsAnimating()", idx)
		}
		for s := 0; s < 40; s++ {
			e.Step(FixedDT)
		}
		if e.Tiles[idx].JiggleT != 0 {
			t.Fatalf("expected periodic wiggle on tile %d to settle within 0.67s, got %v", idx, e.Tiles[idx].JiggleT)
		}
	}
	if e.IsAnimating() {
		t.Fatalf("expected IsAnimating() == false after periodic wiggle settles")
	}

	// Finish C0 -> C2 unlocks immediately (2 active colors: C2 & C1), C2 glows AND queues a +0.85s delayed wiggle (NOT C1)!
	e.Remain[c0] = 0
	e.refillActiveColors()
	if e.Active[0] != c2 || e.Active[1] != c1 {
		t.Fatalf("after finishing C0, expected active [%d,%d], got [%d,%d]", c2, c1, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c2] < 0.99 || e.ColorGlowT[c1] != 0 {
		t.Fatalf("expected newly unlocked C2 to trigger interior spotlight (and not C1), got %v", e.ColorGlowT)
	}
	for i := 0; i < e.TileCount; i++ {
		if int(e.Tiles[i].Color) == c2 && (e.Tiles[i].JiggleT != 0 || e.Tiles[i].JiggleDelay < 0.75) {
			t.Fatalf("expected newly unlocked C2 tile %d to delay wiggle (+0.85s), got T=%v Delay=%v", i, e.Tiles[i].JiggleT, e.Tiles[i].JiggleDelay)
		}
		if int(e.Tiles[i].Color) == c1 && (e.Tiles[i].JiggleT != 0 || e.Tiles[i].JiggleDelay != 0) {
			t.Fatalf("already-active C1 tile %d should not bulk-wiggle on C2 unlock", i)
		}
	}
	// After 0.90s (54 ticks), newly unlocked C2 tiles are wiggling while C1 stays calm!
	for i := 0; i < 54; i++ {
		e.Step(FixedDT)
	}
	for i := 0; i < e.TileCount; i++ {
		if int(e.Tiles[i].Color) == c2 && e.Tiles[i].JiggleT < 0.75 {
			t.Fatalf("expected newly unlocked C2 tile %d to wiggle at 0.90s, got JiggleT=%v", i, e.Tiles[i].JiggleT)
		}
		if int(e.Tiles[i].Color) == c1 && e.Tiles[i].JiggleT != 0 {
			t.Fatalf("already-active C1 tile %d must remain calm at 0.90s", i)
		}
	}

	// Finish C1 -> C3 (FINAL color) MUST NOT unlock while C2 is still incomplete! Only C2 is active!
	e.Remain[c1] = 0
	e.refillActiveColors()
	if e.Active[0] != c2 || e.Active[1] != -1 {
		t.Fatalf("after finishing C1 while C2 remains, expected SOLO active [%d,-1], got [%d,%d]", c2, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c3] != 0 {
		t.Fatalf("final color C3 must not glow before unlocking")
	}

	// Finish C2 -> NOW final color C3 unlocks solo and triggers interior spotlight!
	e.Remain[c2] = 0
	e.refillActiveColors()
	if e.Active[0] != c3 || e.Active[1] != -1 {
		t.Fatalf("after finishing C2, expected FINAL color [%d,-1], got [%d,%d]", c3, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c3] < 0.99 {
		t.Fatalf("expected final color C3 to trigger interior spotlight upon unlocking, got %v", e.ColorGlowT[c3])
	}
}

func TestZeroVisualSpoilersAndCausalBlocker(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(2)

	blockedIdx := -1
	for i := 0; i < e.TileCount; i++ {
		if !e.Tiles[i].Alive {
			continue
		}
		flags := uint32(e.Scene[SceneTileOffset+i*8+6])
		if (flags & 2) != 0 {
			t.Fatalf("tile %d leaked unblocked spoiler bit 2 into GPU flags (%d)", i, flags)
		}
		if (flags & 16) != 0 {
			t.Fatalf("tile %d should not set permanent bit 16 glow flag (%d)", i, flags)
		}
		if !isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) && blockedIdx < 0 {
			blockedIdx = i
		}
	}
	if blockedIdx < 0 {
		t.Fatalf("expected interlocking blocked tiles on 5x5 Jewel Heart")
	}

	if e.TapTile(blockedIdx) {
		t.Fatalf("blocked tile %d should not be freed", blockedIdx)
	}
	if e.LastBlockerIdx < 0 || e.BlockerFlashT <= 0 {
		t.Fatalf("expected causal blocker index and flash pulse, got idx=%d flash=%v", e.LastBlockerIdx, e.BlockerFlashT)
	}
}

func TestSmartPinchRescueHintAndScoreDeductions(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(2)

	for s := 0; s < 3; s++ {
		mv := -1
		for i := 0; i < e.TileCount; i++ {
			if e.Tiles[i].Alive && e.isActiveColor(e.Tiles[i].Color) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
				mv = i
				break
			}
		}
		if mv < 0 {
			break
		}
		e.TapTile(mv)
	}
	scoreBeforeHint := e.Score
	if scoreBeforeHint < 300 {
		t.Fatalf("expected >= 300 score after direct stitches, got %d", scoreBeforeHint)
	}

	hIdx := e.ComputeHint()
	if hIdx < 0 {
		t.Fatalf("expected valid hint on open board, got %d", hIdx)
	}
	if e.Score != scoreBeforeHint-HintScorePenalty {
		t.Fatalf("expected score %d after hint (-%d), got %d", scoreBeforeHint-HintScorePenalty, HintScorePenalty, e.Score)
	}

	if !e.Undo() {
		t.Fatalf("expected Undo to succeed")
	}
	if e.Streak != 0 || e.UndoUsed != 1 {
		t.Fatalf("expected Undo to reset streak and increment UndoUsed")
	}

	// Force dead-end pinch -> Hint returns HintNeedsUndo (-2)
	e.TrayLen = TrayCapacity
	for i := 0; i < TrayCapacity; i++ {
		for c := uint8(0); c < NumColors; c++ {
			if !e.isActiveColor(c) {
				e.Tray[i] = c
				break
			}
		}
	}
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive && e.isActiveColor(e.Tiles[i].Color) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
			e.Tiles[i].Color = e.Tray[0]
		}
	}
	if rescue := e.ComputeHint(); rescue != HintNeedsUndo {
		t.Fatalf("expected HintNeedsUndo (%d) in dead-end pinch, got %d", HintNeedsUndo, rescue)
	}
}

func TestDailyStitchAndEndlessMandalaRotate4ThemesAndThreeStar100Pct(t *testing.T) {
	var e Engine
	var eDaily, eSeed Engine
	var seenDaily [NumThemes]bool
	var seenMandala [NumThemes]bool

	// Verify Daily Stitch is literally identical to entering that YYYYMMDD date as a custom seed!
	eDaily.LoadDaily(20261125)
	eSeed.LoadMandala(20261125)
	if eDaily.ThemeIndex != eSeed.ThemeIndex || eDaily.TileCount != eSeed.TileCount {
		t.Fatalf("Daily 20261125 must match custom seed 20261125! daily=(t=%d n=%d) seed=(t=%d n=%d)",
			eDaily.ThemeIndex, eDaily.TileCount, eSeed.ThemeIndex, eSeed.TileCount)
	}
	for i := 0; i < eDaily.TileCount; i++ {
		if eDaily.Tiles[i] != eSeed.Tiles[i] {
			t.Fatalf("Daily 20261125 tile %d mismatch vs custom seed 20261125", i)
		}
	}
	// Verify exact uint32 seed round-trip via State[52..53]
	reconstructed := uint32(eDaily.State[52]) | (uint32(eDaily.State[53]) << 16)
	if reconstructed != 20261125 {
		t.Fatalf("expected reconstructed uint32 seed 20261125, got %d", reconstructed)
	}

	for d := uint32(0); d < 40; d++ {
		dateKey := uint32(20261101) + d
		e.LoadDaily(dateKey)
		seenDaily[e.ThemeIndex] = true

		var aliveMask uint64
		for i := 0; i < e.TileCount; i++ {
			aliveMask |= (uint64(1) << uint(i))
		}
		st := solverState{
			aliveMask: aliveMask,
			remain:    e.Remain,
			active:    e.Active,
			queue:     e.ColorQueue,
			queueLen:  e.QueueLen,
			queuePos:  e.QueuePos,
		}
		starLimit := ThreeStarTrayLimit(e.HoopCount)
		if ok, _ := solveWithTrayBudget(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, starLimit, 16000); !ok {
			t.Fatalf("Daily Stitch %d (theme %d, n=%d) not 3-star solvable within trayLimit=%d!", dateKey, e.ThemeIndex, e.HoopCount, starLimit)
		}
	}

	for seed := uint32(100001); seed <= 100040; seed++ {
		e.LoadMandala(seed)
		seenMandala[e.ThemeIndex] = true
		var aliveMask uint64
		for i := 0; i < e.TileCount; i++ {
			aliveMask |= (uint64(1) << uint(i))
		}
		st := solverState{
			aliveMask: aliveMask,
			remain:    e.Remain,
			active:    e.Active,
			queue:     e.ColorQueue,
			queueLen:  e.QueueLen,
			queuePos:  e.QueuePos,
		}
		starLimit := ThreeStarTrayLimit(e.HoopCount)
		if ok, _ := solveWithTrayBudget(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, starLimit, 16000); !ok {
			t.Fatalf("Endless seed %d (theme %d, n=%d) not 3-star solvable within trayLimit=%d!", seed, e.ThemeIndex, e.HoopCount, starLimit)
		}
	}

	for th := 0; th < NumThemes; th++ {
		if !seenDaily[th] || !seenMandala[th] {
			t.Fatalf("Theme %d missed in Daily/Endless rotation", th)
		}
	}
}

func TestSolar24hContinuity(t *testing.T) {
	prev := ComputeSolarLighting(0)
	for h := 0.25; h <= 24.0; h += 0.25 {
		cur := ComputeSolarLighting(float32(h))
		if math.IsNaN(float64(cur.SunDirX)) || math.IsNaN(float64(cur.DaylightFactor)) {
			t.Fatalf("NaN solar value at h=%v", h)
		}
		if math.Abs(float64(cur.DaylightFactor-prev.DaylightFactor)) > 0.22 {
			t.Fatalf("discontinuous solar jump at h=%v", h)
		}
		prev = cur
	}
}

func TestHeartPearlsEarlyBonusAndCustomJsonLevel(t *testing.T) {
	var e Engine

	// 1. Verify 64-tile 8x8 Grand Masterpiece loads cleanly via CustomLevelBuf (remote levels.json ABI!)
	art64 := CuratedArtworks[12] // 8x8 Grand Jewel Rose (64 stitches)
	e.CustomLevelBuf[0] = 64
	e.CustomLevelBuf[1] = 0
	e.CustomLevelBuf[2] = 0
	e.CustomLevelBuf[3] = 8
	e.CustomLevelBuf[4] = 8
	e.CustomLevelBuf[5] = 11
	e.CustomLevelBuf[6] = float32(art64.Seed & 0xFFFF)
	e.CustomLevelBuf[7] = float32((art64.Seed >> 16) & 0xFFFF)
	e.CustomLevelBuf[8] = 0
	e.CustomLevelBuf[9] = 3
	for i, sp := range art64.Stitches {
		off := 10 + i*4
		e.CustomLevelBuf[off+0] = sp.X
		e.CustomLevelBuf[off+1] = sp.Z
		e.CustomLevelBuf[off+2] = float32(sp.Color)
		e.CustomLevelBuf[off+3] = float32(sp.Layer)
	}
	if !e.LoadCustomLevel(len(art64.Stitches)) || e.TileCount != 64 || e.HoopCount != 64 {
		t.Fatalf("expected 64-tile 8x8 custom JSON load, got tiles=%d hoop=%d", e.TileCount, e.HoopCount)
	}

	// 2. Load a custom JSON-staged zero-blocker level (NoBlockers=true, MaxHearts=2) via CustomLevelBuf
	art := CuratedArtworks[1] // 16 stitches
	e.CustomLevelBuf[0] = 99
	e.CustomLevelBuf[1] = 1
	e.CustomLevelBuf[2] = 1
	e.CustomLevelBuf[3] = 5
	e.CustomLevelBuf[4] = 5
	e.CustomLevelBuf[5] = 1
	e.CustomLevelBuf[6] = 777
	e.CustomLevelBuf[7] = 0
	e.CustomLevelBuf[8] = 1 // bit 0 = NoBlockers
	e.CustomLevelBuf[9] = 2 // 2 hearts
	count := 16             // 16 perimeter tiles on 5x5 -> 100% zero blockers!
	for i := 0; i < count; i++ {
		sp := art.Stitches[i]
		off := 10 + i*4
		e.CustomLevelBuf[off+0] = sp.X
		e.CustomLevelBuf[off+1] = sp.Z
		e.CustomLevelBuf[off+2] = float32(sp.Color)
		e.CustomLevelBuf[off+3] = float32(sp.Layer)
	}
	if !e.LoadCustomLevel(count) {
		t.Fatalf("LoadCustomLevel failed")
	}
	if e.LevelIndex != 99 || e.ThemeIndex != 1 || e.TileCount != count {
		t.Fatalf("unexpected custom level state: lvl=%d theme=%d tiles=%d", e.LevelIndex, e.ThemeIndex, e.TileCount)
	}
	for i := 0; i < e.TileCount; i++ {
		if !isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
			t.Fatalf("NoBlockers custom level tile %d (%d,%d dir=%d) should be unblocked on tap 1", i, e.Tiles[i].Col, e.Tiles[i].Row, e.Tiles[i].Dir)
		}
	}

	// 3. Placing a Heart Pearl early yields strictly MORE bonus points than placing it late!
	var heartIndices []int
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].IsHeart {
			heartIndices = append(heartIndices, i)
		}
	}
	if len(heartIndices) != 2 {
		t.Fatalf("expected 2 Heart Pearls, got %d", len(heartIndices))
	}
	// Tap an active-color Heart Pearl first (early)
	earlyIdx := -1
	for _, hi := range heartIndices {
		if e.isActiveColor(e.Tiles[hi].Color) {
			earlyIdx = hi
			break
		}
	}
	if earlyIdx < 0 {
		t.Fatalf("expected at least 1 Heart Pearl on an active start color")
	}
	if !e.TapTile(earlyIdx) {
		t.Fatalf("expected early active Heart Pearl tap to succeed")
	}
	earlyBonus := e.LastHeartBonus
	if e.HeartClearEvents != 1 || earlyBonus < 500 {
		t.Fatalf("expected early Heart bonus >= 500 & HeartClearEvents==1, got bonus=%d ev=%d", earlyBonus, e.HeartClearEvents)
	}

	// Solve the rest of the level and confirm the second (later) Heart Pearl yields strictly fewer bonus points
	for step := 0; step < 30 && e.Phase != PhaseComplete; step++ {
		h := e.ComputeHint()
		if h < 0 {
			break
		}
		e.TapTile(h)
	}
	if e.HeartClearEvents != 2 {
		t.Fatalf("expected both Heart Pearls cleared, got HeartClearEvents=%d", e.HeartClearEvents)
	}
	if e.LastHeartBonus >= earlyBonus {
		t.Fatalf("expected later Heart bonus (%d) < early Heart bonus (%d)", e.LastHeartBonus, earlyBonus)
	}
}

