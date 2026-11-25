package sim

import (
	"math"
	"testing"
)

func TestAll8LargeCuratedArtworksSolvableAndRewarding(t *testing.T) {
	for idx, art := range CuratedArtworks {
		var e Engine
		e.LoadCuratedLevel(idx)

		if e.TileCount < 20 {
			t.Fatalf("level %d (%s): expected substantial board >= 20 pearls, got %d", idx, art.Name, e.TileCount)
		}

		maxTrayUsed := 0
		steps := 0
		for e.Phase != PhaseComplete && steps < 64 {
			hint := e.ComputeHint()
			if hint < 0 {
				t.Fatalf("level %d (%s): solver stuck at step %d (trayLen=%d)", idx, art.Name, steps, e.TrayLen)
			}
			if !e.TapTile(hint) {
				t.Fatalf("level %d (%s): hint tile %d failed", idx, art.Name, hint)
			}
			if e.TrayLen > maxTrayUsed {
				maxTrayUsed = e.TrayLen
			}
			steps++
		}

		if e.Phase != PhaseComplete {
			t.Fatalf("level %d (%s): did not complete within 64 steps", idx, art.Name)
		}
		if e.Score == 0 || e.Stars < 1 || e.LayersComplete != e.TotalLayers || e.ColorClearEvents == 0 {
			t.Fatalf("level %d (%s): missing mastery rewards score=%d stars=%d layers=%d/%d colorClears=%d",
				idx, art.Name, e.Score, e.Stars, e.LayersComplete, e.TotalLayers, e.ColorClearEvents)
		}

		t.Logf("Level %d (%s, %dx%d): %d pearls | Score=%d | MaxStreak=%dx | Stars=%d | Layers=%d/%d | MaxTray=%d/5",
			idx, art.Name, art.Cols, art.Rows, e.TileCount, e.Score, e.MaxStreak, e.Stars, e.LayersComplete, e.TotalLayers, maxTrayUsed)
	}
}

func TestBlockerCausalFeedbackAndNoVisualSpoilers(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(1)

	// Confirm GPU scene flags NEVER encode unblocked bit (bit 2 = 2) -> zero visual spoilers!
	for i := 0; i < e.TileCount; i++ {
		flags := uint32(e.Scene[SceneTileOffset+i*8+6])
		if (flags & 2) != 0 {
			t.Fatalf("tile %d leaks unblocked spoiler flag in GPU buffer!", i)
		}
	}

	// Find a blocked tile and confirm tapping identifies the EXACT blocking neighbor
	foundBlocked := false
	for i := 0; i < e.TileCount; i++ {
		blocker := findFirstBlocker(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows)
		if blocker >= 0 {
			foundBlocked = true
			if e.TapTile(i) {
				t.Fatalf("blocked tile %d should not free", i)
			}
			if e.LastBlockerIdx != blocker || e.BlockerFlashT <= 0 {
				t.Fatalf("expected blocker=%d flash>0, got blocker=%d flash=%f", blocker, e.LastBlockerIdx, e.BlockerFlashT)
			}
			break
		}
	}
	if !foundBlocked {
		t.Fatalf("expected 5x5 Sakura Mandala to have interlocking blocked tiles")
	}
}

func TestStreakMultiplierAndUndoRestoration(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(0)

	// Undo restores score, streak, layers, and alive tiles
	for k := 0; k < 4; k++ {
		mv := e.ComputeHint()
		if !e.TapTile(mv) {
			t.Fatalf("move %d failed", k)
		}
	}
	if e.Score == 0 {
		t.Fatalf("expected positive score after 4 moves")
	}
	for k := 0; k < 4; k++ {
		if !e.Undo() {
			t.Fatalf("undo %d failed", k)
		}
	}
	if e.Score != 0 || e.Streak != 0 || e.TrayLen != 0 || e.UndoUsed != 4 {
		t.Fatalf("unexpected state after full undo: score=%d streak=%d tray=%d undoUsed=%d",
			e.Score, e.Streak, e.TrayLen, e.UndoUsed)
	}
}

func TestSolar24hContinuityAndAll5ThemesValid(t *testing.T) {
	prev := ComputeSolarLighting(0.0)
	for step := 1; step <= 240; step++ {
		h := float32(step) * 0.1
		cur := ComputeSolarLighting(h)
		d := math.Abs(float64(cur.DeskR-prev.DeskR)) +
			math.Abs(float64(cur.DeskG-prev.DeskG)) +
			math.Abs(float64(cur.DeskB-prev.DeskB))
		if d > 0.08 {
			t.Fatalf("abrupt solar jump at hour %.1f: delta=%.4f", h, d)
		}
		prev = cur
	}

	var e Engine
	e.LoadCuratedLevel(0)
	for theme := 0; theme < NumThemes; theme++ {
		e.SetTheme(theme)
		for i, v := range e.Scene {
			if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
				t.Fatalf("theme %d produced non-finite scene[%d]=%v", theme, i, v)
			}
		}
	}
}

func TestMandala60SeedsLargeBoardsSolvable(t *testing.T) {
	totalPearls := 0
	for seed := uint32(1); seed <= 60; seed++ {
		var e Engine
		e.LoadMandala(seed * 2654435761)
		if e.TileCount < 24 || e.TileCount > MaxGridTiles {
			t.Fatalf("seed %d: expected substantial mandala 24..49 pearls, got %d", seed, e.TileCount)
		}
		totalPearls += e.TileCount
		steps := 0
		for e.Phase != PhaseComplete && steps < 64 {
			mv := e.ComputeHint()
			if mv < 0 || !e.TapTile(mv) {
				t.Fatalf("mandala seed %d failed at step %d", seed, steps)
			}
			steps++
		}
		if e.Phase != PhaseComplete {
			t.Fatalf("mandala seed %d incomplete", seed)
		}
	}
	t.Logf("60 large procedural mandalas 100%% solvable (avg %.1f pearls)", float64(totalPearls)/60.0)
}
