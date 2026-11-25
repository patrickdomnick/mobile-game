package sim

import (
	"math"
	"testing"
)

func TestAll32ChapterArtworksSolvableAndThemed(t *testing.T) {
	if len(CuratedArtworks) != NumChapters*LevelsPerChapter {
		t.Fatalf("expected %d curated artworks (4 chapters x 8), got %d", NumChapters*LevelsPerChapter, len(CuratedArtworks))
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
			ok, mv := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 16000)
			if !ok || mv < 0 {
				t.Fatalf("level %d (%s): solver could not find winning move at step %d (tray=%d)", lvlIdx, art.Name, step, e.TrayLen)
			}
			if !e.TapTile(mv) {
				t.Fatalf("level %d (%s): TapTile(%d) failed", lvlIdx, art.Name, mv)
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
	t.Logf("All %d handcrafted artworks across %d vibrant Chapters verified 100%% solvable under Solo Finale rule!", len(CuratedArtworks), NumChapters)
}

func TestSoloFinaleLastTwoColorsUnlockSeparatelyAndTemporaryInteriorGlow(t *testing.T) {
	var e Engine
	// Level 0 (Jewel Heart) has exactly 4 colors: C0, C1, C2, C3
	e.LoadCuratedLevel(0)
	if e.QueueLen != 4 {
		t.Fatalf("expected 4 colors on Jewel Heart, got %d", e.QueueLen)
	}
	c0 := int(e.ColorQueue[0])
	c1 := int(e.ColorQueue[1])
	c2 := int(e.ColorQueue[2])
	c3 := int(e.ColorQueue[3])

	// At game start: C0 & C1 are active AND temporarily glowing from inside (ColorGlowT == 1.0)
	if e.Active[0] != c0 || e.Active[1] != c1 {
		t.Fatalf("expected initial active [%d,%d], got [%d,%d]", c0, c1, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c0] < 0.99 || e.ColorGlowT[c1] < 0.99 || e.ColorGlowT[c2] != 0 || e.ColorGlowT[c3] != 0 {
		t.Fatalf("expected initial interior glow only on C0/C1, got %v", e.ColorGlowT)
	}

	// Step 2.5 seconds -> temporary interior glow fades completely to 0 so GPU can sleep at 0 FPS!
	for i := 0; i < 150; i++ {
		e.Step(FixedDT)
	}
	if e.ColorGlowT[c0] != 0 || e.ColorGlowT[c1] != 0 {
		t.Fatalf("expected temporary start glow to fade to 0 after 2.5s, got %v", e.ColorGlowT)
	}
	if e.IsAnimating() {
		t.Fatalf("expected IsAnimating() == false once start glow finishes (for 0-FPS battery idle)")
	}

	// Finish C0 -> C2 unlocks immediately (2 active colors: C2 & C1), C2 glows from inside!
	e.Remain[c0] = 0
	e.refillActiveColors()
	if e.Active[0] != c2 || e.Active[1] != c1 {
		t.Fatalf("after finishing C0, expected active [%d,%d], got [%d,%d]", c2, c1, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c2] < 0.99 || e.ColorGlowT[c1] != 0 {
		t.Fatalf("expected newly unlocked C2 to trigger interior glow (and not C1), got %v", e.ColorGlowT)
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

	// Finish C2 -> NOW final color C3 unlocks solo and triggers interior glow!
	e.Remain[c2] = 0
	e.refillActiveColors()
	if e.Active[0] != c3 || e.Active[1] != -1 {
		t.Fatalf("after finishing C2, expected FINAL color [%d,-1], got [%d,%d]", c3, e.Active[0], e.Active[1])
	}
	if e.ColorGlowT[c3] < 0.99 {
		t.Fatalf("expected final color C3 to pulse interior glow upon unlocking, got %v", e.ColorGlowT[c3])
	}
}

func TestZeroVisualSpoilersAndCausalBlocker(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(0)

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
	e.LoadCuratedLevel(0)

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

func TestDailyStitchAndEndlessMandalaRotate4ThemesAndSolve100Pct(t *testing.T) {
	var e Engine
	var seenDaily [NumThemes]bool
	var seenMandala [NumThemes]bool

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
		if ok, _ := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 16000); !ok {
			t.Fatalf("Daily Stitch %d (theme %d) not solved under Solo Finale rule!", dateKey, e.ThemeIndex)
		}
	}

	for seed := uint32(1); seed <= 40; seed++ {
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
		if ok, _ := solveFromState(e.Tiles[:e.TileCount], e.GridCols, e.GridRows, st, 16000); !ok {
			t.Fatalf("Endless Mandala seed %d (theme %d) not solved under Solo Finale rule!", seed, e.ThemeIndex)
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
