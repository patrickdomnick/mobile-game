package sim

import (
	"math"
	"testing"
)

func TestAll40ChapterArtworksSolvableAndThemed(t *testing.T) {
	if len(CuratedArtworks) != NumChapters*LevelsPerChapter {
		t.Fatalf("expected %d curated artworks (5 chapters x 8), got %d", NumChapters*LevelsPerChapter, len(CuratedArtworks))
	}

	var e Engine
	e.SetTimeOfDayHours(12.5)

	for lvlIdx, art := range CuratedArtworks {
		e.LoadCuratedLevel(lvlIdx)
		if e.ThemeIndex != art.Theme {
			t.Fatalf("level %d (%s): expected native theme %d, got %d", lvlIdx, art.Name, art.Theme, e.ThemeIndex)
		}
		if e.ChapterIndex != art.Chapter {
			t.Fatalf("level %d (%s): expected chapter %d, got %d", lvlIdx, art.Name, art.Chapter, e.ChapterIndex)
		}

		// Verify Noir Salon (Chapter 1) is intentionally calmer with strictly <= 4 geometric B&W types!
		if art.Chapter == 1 {
			if art.Theme != ThemeNoirBW {
				t.Fatalf("chapter 1 level %d (%s) must use ThemeNoirBW", lvlIdx, art.Name)
			}
			var seen [NumColors]bool
			distinct := 0
			for _, sp := range art.Stitches {
				if !seen[sp.Color] {
					seen[sp.Color] = true
					distinct++
				}
			}
			if distinct > 4 {
				t.Fatalf("Noir Salon level %d (%s) has %d pearl types (expected <= 4 for monochrome clarity)", lvlIdx, art.Name, distinct)
			}
			if len(art.Stitches) > 25 {
				t.Fatalf("Noir Salon level %d (%s) has %d pearls (expected <= 25 for calmer pacing)", lvlIdx, art.Name, len(art.Stitches))
			}
		}

		maxTray := 0
		for step := 0; step < 80 && e.Phase != PhaseComplete; step++ {
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
				remain:    e.Remain,
				active:    e.Active,
				queue:     e.ColorQueue,
				queueLen:  e.QueueLen,
				queuePos:  e.QueuePos,
			}
			ok, mv := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 12000)
			if !ok || mv < 0 {
				t.Fatalf("level %d (%s): solver could not find winning move at step %d (tray=%d)", lvlIdx, art.Name, step, e.TrayLen)
			}
			if !e.TapTile(mv) {
				t.Fatalf("level %d (%s): TapTile(%d) failed", lvlIdx, art.Name, mv)
			}
			if e.TrayLen > maxTray {
				maxTray = e.TrayLen
			}
		}

		for i := 0; i < 180; i++ {
			e.Step(FixedDT)
		}
		if e.Phase != PhaseComplete {
			t.Fatalf("level %d (%s): expected PhaseComplete, got %d", lvlIdx, art.Name, e.Phase)
		}
		if e.Score == 0 || e.Stars < 1 {
			t.Fatalf("level %d (%s): invalid mastery score=%d stars=%d", lvlIdx, art.Name, e.Score, e.Stars)
		}
	}
	t.Logf("All %d handcrafted artworks across %d themed Chapters verified 100%% solvable!", len(CuratedArtworks), NumChapters)
}

func TestActiveColorGlowZeroSpoilersAndCausalBlocker(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(0)

	foundActiveBlocked := false
	foundActiveUnblocked := false
	blockedIdx := -1

	for i := 0; i < e.TileCount; i++ {
		if !e.Tiles[i].Alive {
			continue
		}
		flags := uint32(e.Scene[SceneTileOffset+i*8+6])
		// Bit 2 (unblocked visual spoiler) MUST NEVER be set!
		if (flags & 2) != 0 {
			t.Fatalf("tile %d leaked unblocked spoiler bit 2 into GPU flags (%d)", i, flags)
		}
		unblocked := isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows)
		isActive := e.isActiveColor(e.Tiles[i].Color)
		hasActiveFlag := (flags & 16) != 0
		if isActive != hasActiveFlag {
			t.Fatalf("tile %d active-color flag mismatch: isActive=%v flag16=%v", i, isActive, hasActiveFlag)
		}
		if isActive && !unblocked {
			foundActiveBlocked = true
		}
		if isActive && unblocked {
			foundActiveUnblocked = true
		}
		if !unblocked && blockedIdx < 0 {
			blockedIdx = i
		}
	}
	if !foundActiveBlocked || !foundActiveUnblocked {
		t.Logf("note: level 0 activeBlocked=%v activeUnblocked=%v", foundActiveBlocked, foundActiveUnblocked)
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
	e.LoadCuratedLevel(0)

	// Make 3 direct stitches to earn a healthy score first
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

	// Hint deducts 250 points (limitless!) and highlights a valid tile
	hIdx := e.ComputeHint()
	if hIdx < 0 {
		t.Fatalf("expected valid hint on open board, got %d", hIdx)
	}
	if e.Score != scoreBeforeHint-HintScorePenalty {
		t.Fatalf("expected score %d after hint (-%d), got %d", scoreBeforeHint-HintScorePenalty, HintScorePenalty, e.Score)
	}
	if e.HintsUsed != 1 {
		t.Fatalf("expected HintsUsed=1, got %d", e.HintsUsed)
	}

	// Calling Hint again on the SAME highlighted tile does NOT double-charge!
	scoreAfterFirstHint := e.Score
	_ = e.ComputeHint()
	if e.Score != scoreAfterFirstHint {
		t.Fatalf("re-tapping Hint for same tile should not double-charge: before=%d after=%d", scoreAfterFirstHint, e.Score)
	}

	// Undo is limitless, reverts tile, resets streak, and deducts 150 from snapshot score
	if !e.Undo() {
		t.Fatalf("expected Undo to succeed")
	}
	if e.Streak != 0 {
		t.Fatalf("expected Undo to reset streak to 0, got %d", e.Streak)
	}
	if e.UndoUsed != 1 {
		t.Fatalf("expected UndoUsed=1, got %d", e.UndoUsed)
	}

	// Force a dead-end pinch (tray full with non-active colors, no direct active unblocked tiles)
	e.TrayLen = TrayCapacity
	for i := 0; i < TrayCapacity; i++ {
		// Fill tray with a non-active color
		for c := uint8(0); c < NumColors; c++ {
			if !e.isActiveColor(c) {
				e.Tray[i] = c
				break
			}
		}
	}
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].Alive && e.isActiveColor(e.Tiles[i].Color) && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
			// Flip color to non-active so board has zero direct moves while tray is full
			e.Tiles[i].Color = e.Tray[0]
		}
	}
	rescue := e.ComputeHint()
	if rescue != HintNeedsUndo {
		t.Fatalf("expected HintNeedsUndo (%d) when trapped in dead-end pinch, got %d", HintNeedsUndo, rescue)
	}
}

func TestDailyStitchAndEndlessMandalaRotateThemesAndSolve100Pct(t *testing.T) {
	var e Engine
	var seenDailyThemes [NumThemes]bool
	var seenMandalaThemes [NumThemes]bool

	// Verify 60 consecutive Daily Stitch dates (including 2026-11-25) rotate themes and solve cleanly!
	for d := uint32(0); d < 60; d++ {
		dateKey := uint32(20261101) + d
		e.LoadDaily(dateKey)
		seenDailyThemes[e.ThemeIndex] = true

		// Verify Restart preserves the exact Daily mode & seed
		prevTheme := e.ThemeIndex
		prevCount := e.HoopCount
		e.Reset()
		if e.Mode != 2 || e.ThemeIndex != prevTheme || e.HoopCount != prevCount {
			t.Fatalf("Reset() did not preserve Daily Stitch state (mode=%d theme=%d)", e.Mode, e.ThemeIndex)
		}

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
		if ok, _ := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 16000); !ok {
			t.Fatalf("Daily Stitch %d (theme %d, %d pearls) not solved cleanly!", dateKey, e.ThemeIndex, e.HoopCount)
		}
	}

	// Verify 50 Endless Mandala seeds rotate all 5 themes and solve cleanly!
	for seed := uint32(1); seed <= 50; seed++ {
		e.LoadMandala(seed)
		seenMandalaThemes[e.ThemeIndex] = true
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
		if ok, _ := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 16000); !ok {
			t.Fatalf("Endless Mandala seed %d (theme %d, %d pearls) not solved cleanly!", seed, e.ThemeIndex, e.HoopCount)
		}
	}

	for th := 0; th < NumThemes; th++ {
		if !seenDailyThemes[th] {
			t.Fatalf("Daily Stitch rotation missed theme %d across 60 days", th)
		}
		if !seenMandalaThemes[th] {
			t.Fatalf("Endless Mandala rotation missed theme %d across 50 seeds", th)
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
