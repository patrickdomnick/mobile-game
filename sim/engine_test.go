package sim

import (
	"math"
	"testing"
)

func TestResetAndDeterminism(t *testing.T) {
	var a, b Engine
	a.Reset()
	b.Reset()

	a.SetPointerNormalized(0.5, -0.5, true)
	b.SetPointerNormalized(0.5, -0.5, true)

	for i := 0; i < 120; i++ {
		a.Step(FixedDT)
		b.Step(FixedDT)
	}

	if a.Scene != b.Scene || a.State != b.State {
		t.Fatalf("simulation is not deterministic")
	}
	if a.FrameCount != 120 {
		t.Fatalf("expected 120 frames, got %d", a.FrameCount)
	}
}

func TestPlayerSteersAndCollectsGem(t *testing.T) {
	var e Engine
	e.Reset()

	initialTargetX, initialTargetZ := e.TargetX, e.TargetZ

	// Steer directly toward the initial gem using normalized coordinates
	nx := initialTargetX / (ArenaHalfW - PlayerRadius)
	nz := initialTargetZ / (ArenaHalfD - PlayerRadius)
	e.SetPointerNormalized(nx, nz, true)

	for i := 0; i < 180 && e.Score == 0; i++ {
		e.Step(FixedDT)
	}

	if e.Score < 1 {
		t.Fatalf("expected player to collect gem, score=%d player=(%.2f,%.2f) target=(%.2f,%.2f)",
			e.Score, e.PlayerX, e.PlayerZ, e.TargetX, e.TargetZ)
	}
	if e.TargetX == initialTargetX && e.TargetZ == initialTargetZ {
		t.Fatalf("expected gem to relocate after collection")
	}
	if e.Pulse <= 0 {
		t.Fatalf("expected collection pulse > 0, got %f", e.Pulse)
	}
}

func TestArenaBoundsAndNoNaN(t *testing.T) {
	var e Engine
	e.Reset()
	e.SetPointerNormalized(10, -10, true) // Out-of-range input should clamp cleanly

	for i := 0; i < 240; i++ {
		e.Step(FixedDT)
	}

	maxX := ArenaHalfW - PlayerRadius + 1e-4
	maxZ := ArenaHalfD - PlayerRadius + 1e-4
	if math.Abs(float64(e.PlayerX)) > float64(maxX) || math.Abs(float64(e.PlayerZ)) > float64(maxZ) {
		t.Fatalf("player escaped arena bounds: (%.3f, %.3f)", e.PlayerX, e.PlayerZ)
	}
	for i, v := range e.Scene {
		if math.IsNaN(float64(v)) || math.IsInf(float64(v), 0) {
			t.Fatalf("scene[%d] is non-finite: %v", i, v)
		}
	}
}
