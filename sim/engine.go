package sim

import "math"

const (
	MaxSpheres   = 8
	HeaderFloats = 16
	SphereFloats = 12 // centerRadius(4) + albedoReflect(4) + emissiveRough(4)
	SceneFloats  = HeaderFloats + MaxSpheres*SphereFloats
	StateFloats  = 16

	ArenaHalfW = float32(2.2)
	ArenaHalfD = float32(3.4)

	PlayerRadius = float32(0.45)
	GemRadius    = float32(0.34)
	FixedDT      = float32(1.0 / 60.0)
)

// Engine holds all deterministic simulation state and flat GPU/telemetry buffers
// with zero per-frame heap allocations.
type Engine struct {
	FrameCount uint32
	ElapsedSec float32
	Score      uint32

	PlayerX  float32
	PlayerZ  float32
	PlayerVX float32
	PlayerVZ float32

	TargetX float32
	TargetZ float32
	Pulse   float32

	PointerActive bool
	PointerX      float32
	PointerZ      float32

	rngState uint32

	Scene [SceneFloats]float32
	State [StateFloats]float32
}

// Reset initializes the arena to a clean deterministic starting state.
func (e *Engine) Reset() {
	e.FrameCount = 0
	e.ElapsedSec = 0
	e.Score = 0

	e.PlayerX = 0
	e.PlayerZ = 1.4
	e.PlayerVX = 0
	e.PlayerVZ = 0

	e.TargetX = 0.85
	e.TargetZ = -1.1
	e.Pulse = 0

	e.PointerActive = false
	e.PointerX = 0
	e.PointerZ = 0

	e.rngState = 0x2F6E2B1

	e.syncBuffers()
}

// SetPointerNormalized maps normalized arena coordinates in [-1, 1] to world XZ.
func (e *Engine) SetPointerNormalized(nx, nz float32, active bool) {
	e.PointerActive = active
	if nx < -1 {
		nx = -1
	} else if nx > 1 {
		nx = 1
	}
	if nz < -1 {
		nz = -1
	} else if nz > 1 {
		nz = 1
	}
	e.PointerX = nx * (ArenaHalfW - PlayerRadius)
	e.PointerZ = nz * (ArenaHalfD - PlayerRadius)
}

// Step advances the simulation by dt seconds (clamped for stability).
func (e *Engine) Step(dt float32) {
	if dt <= 0 {
		dt = FixedDT
	}
	if dt > 0.05 {
		dt = 0.05
	}

	e.FrameCount++
	e.ElapsedSec += dt

	if e.Pulse > 0 {
		e.Pulse -= dt * 2.4
		if e.Pulse < 0 {
			e.Pulse = 0
		}
	}

	// Spring-steered player physics toward active touch target
	if e.PointerActive {
		dx := e.PointerX - e.PlayerX
		dz := e.PointerZ - e.PlayerZ
		const accel = float32(26.0)
		e.PlayerVX += dx * accel * dt
		e.PlayerVZ += dz * accel * dt
	}

	// Smooth velocity damping
	damp := float32(math.Exp(float64(-4.8 * dt)))
	e.PlayerVX *= damp
	e.PlayerVZ *= damp

	// Clamp max speed
	const maxSpeed = float32(9.0)
	speedSq := e.PlayerVX*e.PlayerVX + e.PlayerVZ*e.PlayerVZ
	if speedSq > maxSpeed*maxSpeed {
		inv := maxSpeed / float32(math.Sqrt(float64(speedSq)))
		e.PlayerVX *= inv
		e.PlayerVZ *= inv
	}

	e.PlayerX += e.PlayerVX * dt
	e.PlayerZ += e.PlayerVZ * dt

	// Crisp elastic wall bounce inside the portrait arena
	minX := -ArenaHalfW + PlayerRadius
	maxX := ArenaHalfW - PlayerRadius
	minZ := -ArenaHalfD + PlayerRadius
	maxZ := ArenaHalfD - PlayerRadius

	if e.PlayerX < minX {
		e.PlayerX = minX
		e.PlayerVX = -e.PlayerVX * 0.65
	} else if e.PlayerX > maxX {
		e.PlayerX = maxX
		e.PlayerVX = -e.PlayerVX * 0.65
	}

	if e.PlayerZ < minZ {
		e.PlayerZ = minZ
		e.PlayerVZ = -e.PlayerVZ * 0.65
	} else if e.PlayerZ > maxZ {
		e.PlayerZ = maxZ
		e.PlayerVZ = -e.PlayerVZ * 0.65
	}

	// Check player <-> collectible gem collision
	cdx := e.PlayerX - e.TargetX
	cdz := e.PlayerZ - e.TargetZ
	hitDist := PlayerRadius + GemRadius
	if cdx*cdx+cdz*cdz <= hitDist*hitDist {
		e.Score++
		e.Pulse = 1.0
		e.spawnNextTarget()
	}

	e.syncBuffers()
}

func (e *Engine) nextRandUnit() float32 {
	// Deterministic xorshift32
	x := e.rngState
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	e.rngState = x
	return float32(x&0xFFFFFF) / float32(0x1000000)
}

func (e *Engine) spawnNextTarget() {
	spanX := ArenaHalfW - GemRadius - 0.35
	spanZ := ArenaHalfD - GemRadius - 0.45

	for attempt := 0; attempt < 8; attempt++ {
		tx := (e.nextRandUnit()*2.0 - 1.0) * spanX
		tz := (e.nextRandUnit()*2.0 - 1.0) * spanZ
		dx := tx - e.PlayerX
		dz := tz - e.PlayerZ
		if dx*dx+dz*dz > 2.25 {
			e.TargetX = tx
			e.TargetZ = tz
			return
		}
	}
	// Deterministic fallback on opposite side of arena
	if e.PlayerZ >= 0 {
		e.TargetZ = -1.6
	} else {
		e.TargetZ = 1.6
	}
	e.TargetX = -e.PlayerX * 0.7
}

func (e *Engine) writeSphere(idx int, x, y, z, r, ar, ag, ab, refl, er, eg, eb, rough float32) {
	base := HeaderFloats + idx*SphereFloats
	e.Scene[base+0] = x
	e.Scene[base+1] = y
	e.Scene[base+2] = z
	e.Scene[base+3] = r

	e.Scene[base+4] = ar
	e.Scene[base+5] = ag
	e.Scene[base+6] = ab
	e.Scene[base+7] = refl

	e.Scene[base+8] = er
	e.Scene[base+9] = eg
	e.Scene[base+10] = eb
	e.Scene[base+11] = rough
}

func (e *Engine) syncBuffers() {
	t := float64(e.ElapsedSec)

	// Header: cameraPos(4), cameraTarget(4), lightDir+pulse(4), meta(4)
	e.Scene[0] = 0.0
	e.Scene[1] = 6.2
	e.Scene[2] = 6.4
	e.Scene[3] = e.ElapsedSec

	e.Scene[4] = 0.0
	e.Scene[5] = 0.15
	e.Scene[6] = 0.0
	e.Scene[7] = 0.92 // vertical FOV in radians

	// Directional key light (normalized in shader) + collection pulse
	e.Scene[8] = 0.52
	e.Scene[9] = 0.88
	e.Scene[10] = 0.44
	e.Scene[11] = e.Pulse

	const activeSpheres = 7
	e.Scene[12] = float32(activeSpheres)
	e.Scene[13] = float32(e.Score)
	e.Scene[14] = ArenaHalfW
	e.Scene[15] = ArenaHalfD

	// 0: Player Chrome Orb (subtle cyan emissive core + high mirror reflection)
	playerY := PlayerRadius + float32(0.03*math.Sin(t*3.2))
	e.writeSphere(
		0,
		e.PlayerX, playerY, e.PlayerZ, PlayerRadius,
		0.78, 0.92, 1.0, 0.86,
		0.08+0.35*e.Pulse, 0.28+0.45*e.Pulse, 0.42+0.35*e.Pulse, 0.06,
	)

	// 1: Collectible Radiant Gem Sphere
	gemY := GemRadius + 0.14 + float32(0.10*math.Sin(t*4.0))
	e.writeSphere(
		1,
		e.TargetX, gemY, e.TargetZ, GemRadius,
		1.0, 0.72, 0.25, 0.55,
		0.95, 0.42, 0.12, 0.12,
	)

	// 2-5: Corner Mirror Anchor Spheres framing the portrait arena
	const cr = float32(0.36)
	e.writeSphere(2, -ArenaHalfW, cr, -ArenaHalfD, cr, 0.92, 0.35, 0.55, 0.72, 0.10, 0.02, 0.06, 0.10)
	e.writeSphere(3, ArenaHalfW, cr, -ArenaHalfD, cr, 0.32, 0.76, 0.95, 0.72, 0.02, 0.08, 0.12, 0.10)
	e.writeSphere(4, -ArenaHalfW, cr, ArenaHalfD, cr, 0.42, 0.92, 0.65, 0.72, 0.03, 0.10, 0.06, 0.10)
	e.writeSphere(5, ArenaHalfW, cr, ArenaHalfD, cr, 0.85, 0.68, 0.32, 0.72, 0.10, 0.06, 0.02, 0.10)

	// 6: Orbiting Pearl Moon casting a dynamic moving shadow
	moonX := float32(1.55 * math.Cos(t*0.85))
	moonZ := float32(1.95 * math.Sin(t*0.85))
	moonY := float32(1.45 + 0.18*math.Sin(t*1.7))
	e.writeSphere(6, moonX, moonY, moonZ, 0.22, 0.94, 0.95, 0.98, 0.80, 0.12, 0.14, 0.22, 0.08)

	// Sync compact telemetry state buffer for JS / E2E AI playtest bridge
	e.State[0] = float32(e.FrameCount)
	e.State[1] = e.ElapsedSec
	e.State[2] = float32(e.Score)
	e.State[3] = e.PlayerX
	e.State[4] = playerY
	e.State[5] = e.PlayerZ
	e.State[6] = e.PlayerVX
	e.State[7] = e.PlayerVZ
	e.State[8] = e.TargetX
	e.State[9] = gemY
	e.State[10] = e.TargetZ
	e.State[11] = e.Pulse
	e.State[12] = ArenaHalfW
	e.State[13] = ArenaHalfD
	if e.PointerActive {
		e.State[14] = 1
	} else {
		e.State[14] = 0
	}
	e.State[15] = float32(activeSpheres)
}
