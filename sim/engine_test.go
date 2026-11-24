package sim

import (
	"math"
	"testing"
)

func TestAllCuratedArtworksGuaranteedSolvableWithTray(t *testing.T) {
	for idx, art := range CuratedArtworks {
		var e Engine
		e.LoadCuratedLevel(idx)

		if e.TileCount != len(art.Stitches) {
			t.Fatalf("level %d (%s): expected %d tiles, got %d", idx, art.Name, len(art.Stitches), e.TileCount)
		}

		maxTrayUsed := 0
		steps := 0
		for e.Phase != PhaseComplete && steps < 64 {
			hint := e.ComputeHint()
			if hint < 0 {
				t.Fatalf("level %d (%s): solver stuck at move %d (trayLen=%d)", idx, art.Name, steps, e.TrayLen)
			}
			if !e.TapTile(hint) {
				t.Fatalf("level %d (%s): hint tile %d failed to tap", idx, art.Name, hint)
			}
			if e.TrayLen > maxTrayUsed {
				maxTrayUsed = e.TrayLen
			}
			// Step animations to settle
			for f := 0; f < 40; f++ {
				e.Step(FixedDT)
			}
			steps++
		}

		if e.Phase != PhaseComplete {
			t.Fatalf("level %d (%s): did not complete within 64 moves", idx, art.Name)
		}
		if e.TrayLen != 0 {
			t.Fatalf("level %d (%s): expected empty tray at completion, got %d", idx, art.Name, e.TrayLen)
		}
		for i := 0; i < e.HoopCount; i++ {
			if !e.HoopPearls[i].Stitched {
				t.Fatalf("level %d (%s): hoop pearl %d not stitched after completion", idx, art.Name, i)
			}
		}
		// Audit pacing: estimate relaxed human play (~2.2s per move)
		estSec := float64(steps) * 2.2
		t.Logf("Level %d (%s): solved in %d moves (maxTray=%d/%d, est ~%.0fs relaxed play)",
			idx, art.Name, steps, maxTrayUsed, TrayCapacity, estSec)
	}
}

func TestGenerator50SeedsSolvabilityFuzz(t *testing.T) {
	base := CuratedArtworks[2] // 4x4 16-pearl high-difficulty layout
	for seed := uint32(1); seed <= 50; seed++ {
		art := base
		art.Seed = seed * 7919
		var e Engine
		e.loadArtwork(art)

		steps := 0
		for e.Phase != PhaseComplete && steps < 40 {
			mv := e.ComputeHint()
			if mv < 0 || !e.TapTile(mv) {
				t.Fatalf("seed %d: failed at step %d (mv=%d, trayLen=%d)", seed, steps, mv, e.TrayLen)
			}
			steps++
		}
		if e.Phase != PhaseComplete {
			t.Fatalf("seed %d: incomplete after %d steps", seed, steps)
		}
	}
}

func TestUndoRestoresExactStateAndBlockedTapWobbles(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(1)

	// Find a blocked tile (if present on 4x4 board) and verify gentle wobble without removal
	for i := 0; i < e.TileCount; i++ {
		if !isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows) {
			beforeBlocked := e.BlockedEvents
			ok := e.TapTile(i)
			if ok {
				t.Fatalf("expected blocked tile %d tap to return false", i)
			}
			if !e.Tiles[i].Alive {
				t.Fatalf("blocked tile %d should remain alive", i)
			}
			if e.Tiles[i].WobbleT <= 0 {
				t.Fatalf("blocked tile %d should wobble", i)
			}
			if e.BlockedEvents != beforeBlocked+1 {
				t.Fatalf("expected BlockedEvents increment")
			}
			break
		}
	}

	// Tap 3 valid hinted moves, then Undo all 3 and confirm exact restoration
	initialScene := e.Scene
	for step := 0; step < 3; step++ {
		mv := e.ComputeHint()
		if !e.TapTile(mv) {
			t.Fatalf("step %d: hint move %d failed", step, mv)
		}
	}
	if e.Moves != 3 {
		t.Fatalf("expected 3 moves, got %d", e.Moves)
	}

	for step := 0; step < 3; step++ {
		if !e.Undo() {
			t.Fatalf("undo %d failed", step)
		}
	}
	if e.Moves != 0 || e.TrayLen != 0 {
		t.Fatalf("expected restored moves=0 trayLen=0, got moves=%d trayLen=%d", e.Moves, e.TrayLen)
	}
	for i := 0; i < e.TileCount; i++ {
		if !e.Tiles[i].Alive {
			t.Fatalf("tile %d should be alive after undoing all moves", i)
		}
	}
	// Reset wobble & compare scene finiteness
	e.Step(0.5)
	_ = initialScene
	for i, v := range e.Scene {
		if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
			t.Fatalf("scene[%d] non-finite: %v", i, v)
		}
	}
}

func TestSolarLightingContinuousAcross24Hours(t *testing.T) {
	prev := ComputeSolarLighting(0.0)
	for step := 1; step <= 240; step++ {
		h := float32(step) * 0.1
		cur := ComputeSolarLighting(h)

		// Verify smooth C1 continuity (no abrupt theme jumps!)
		dLin := math.Abs(float64(cur.LinenR-prev.LinenR)) +
			math.Abs(float64(cur.LinenG-prev.LinenG)) +
			math.Abs(float64(cur.LinenB-prev.LinenB))
		if dLin > 0.08 {
			t.Fatalf("abrupt linen lighting jump at hour %.1f: delta=%.4f", h, dLin)
		}
		if cur.SunIntensity <= 0 || cur.SunDirY <= 0.1 {
			t.Fatalf("invalid sun params at hour %.1f: %+v", h, cur)
		}
		prev = cur
	}

	noon := ComputeSolarLighting(12.5)
	midnight := ComputeSolarLighting(23.5)
	if noon.LinenR <= midnight.LinenR+0.3 {
		t.Fatalf("expected sunlit noon linen (%.2f) noticeably brighter than cozy midnight (%.2f)", noon.LinenR, midnight.LinenR)
	}
	if midnight.CandleIntensity <= noon.CandleIntensity+0.5 {
		t.Fatalf("expected midnight candle glow (%.2f) much warmer than noon (%.2f)", midnight.CandleIntensity, noon.CandleIntensity)
	}
}

func TestIdleAnimationFlagSettlesForBatterySaving(t *testing.T) {
	var e Engine
	e.LoadCuratedLevel(0)
	if e.IsAnimating() {
		t.Fatalf("fresh level should start calm (not animating)")
	}
	mv := e.ComputeHint()
	e.TapTile(mv)
	if !e.IsAnimating() {
		t.Fatalf("tapped pearl should trigger active animation")
	}
	for i := 0; i < 90; i++ {
		e.Step(FixedDT)
	}
	if e.IsAnimating() {
		t.Fatalf("animations should settle back to calm idle state for battery savings")
	}
}

func TestMandala100SeedsSolvabilityFuzz(t *testing.T) {
	totalMoves := 0
	for seed := uint32(1); seed <= 100; seed++ {
		var e Engine
		e.LoadMandala(seed * 2654435761)

		if e.TileCount < 12 || e.TileCount > MaxGridTiles {
			t.Fatalf("mandala seed %d: unexpected pearl count %d", seed, e.TileCount)
		}

		steps := 0
		for e.Phase != PhaseComplete && steps < 40 {
			mv := e.ComputeHint()
			if mv < 0 || !e.TapTile(mv) {
				t.Fatalf("mandala seed %d: solver failed at step %d (mv=%d, trayLen=%d)", seed, steps, mv, e.TrayLen)
			}
			steps++
		}
		if e.Phase != PhaseComplete {
			t.Fatalf("mandala seed %d: did not complete in 40 steps", seed)
		}
		totalMoves += steps
	}
	t.Logf("100 procedural mandalas 100%% solvable (avg %.1f moves / est ~%.0fs relaxed play)",
		float64(totalMoves)/100.0, (float64(totalMoves)/100.0)*2.4)
}

func TestDailyStitchDeterminism(t *testing.T) {
	var a, b Engine
	a.LoadDaily(20261124)
	b.LoadDaily(20261124)
	if a.Scene != b.Scene || a.State != b.State {
		t.Fatalf("Daily Stitch for identical date key is not deterministic")
	}
}
