package sim

import "math"

// SolarLighting captures continuous 24-hour real-world lighting parameters
// with smooth C1 interpolation and zero discrete theme steps.
type SolarLighting struct {
	SunDirX, SunDirY, SunDirZ float32
	SunIntensity              float32
	SunR, SunG, SunB          float32
	CandleIntensity           float32
	AmbientR, AmbientG, AmbientB float32
	LinenR, LinenG, LinenB    float32
}

func smoothstep(edge0, edge1, x float64) float64 {
	if edge1 <= edge0 {
		if x < edge0 {
			return 0
		}
		return 1
	}
	t := (x - edge0) / (edge1 - edge0)
	if t < 0 {
		t = 0
	} else if t > 1 {
		t = 1
	}
	return t * t * (3 - 2*t)
}

func lerp(a, b, t float64) float64 {
	return a + (b-a)*t
}

func lerp3(ar, ag, ab, br, bg, bb, t float64) (float64, float64, float64) {
	return lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)
}

// ComputeSolarLighting maps real-world local time (hours in [0, 24)) continuously
// to studio window sunlight, twilight transition, and cozy bedside candlelight.
func ComputeSolarLighting(hours float32) SolarLighting {
	h := math.Mod(float64(hours), 24.0)
	if h < 0 {
		h += 24.0
	}

	// Solar elevation proxy: peaks smoothly at 13:00, lowest at 01:00
	dayAngle := ((h - 7.0) / 24.0) * 2.0 * math.Pi
	sinElev := math.Sin(dayAngle) // >0 during ~07:00..19:00

	// Smooth daylight factor [0 = deep night, 1 = bright midday] over a wide, imperceptible twilight ramp
	daylight := smoothstep(-0.38, 0.48, sinElev)
	// Golden-hour / dawn warmth peaks smoothly near the horizon crossing
	horizonWarmth := math.Exp(-math.Pow((sinElev-0.04)/0.34, 2.0))
	// Deep night factor for cozy moonlit + warm bedside candle balance
	nightFactor := 1.0 - smoothstep(-0.42, 0.22, sinElev)

	// Sun azimuth sweeps east (+X) -> south -> west (-X) across the studio window
	azimuth := lerp(-0.95, 0.95, smoothstep(5.0, 20.5, h))
	// Keep elevation gracefully angled (0.68..1.14 rad) so shadows sculpt pearls without stretching over neighbors
	elev := lerp(0.68, 1.14, daylight)

	sx := math.Cos(elev) * math.Sin(azimuth)
	sy := math.Sin(elev)
	sz := math.Cos(elev) * math.Cos(azimuth) * 0.55 - 0.12
	// Normalize light direction
	slen := math.Sqrt(sx*sx + sy*sy + sz*sz)
	if slen < 1e-5 {
		slen = 1
	}
	sx /= slen
	sy /= slen
	sz /= slen

	// Key light color: silver-indigo moonlight -> blush/amber dawn & sunset -> warm sunlit ivory
	sunR, sunG, sunB := lerp3(0.54, 0.64, 0.92, 1.00, 0.96, 0.89, daylight)
	sunR, sunG, sunB = lerp3(sunR, sunG, sunB, 1.00, 0.68, 0.38, horizonWarmth*0.76)

	// Sun intensity smoothly rises from soft moonlight (0.40) to balanced studio sun (0.94)
	sunIntensity := lerp(0.40, 0.94, daylight) + horizonWarmth*0.12

	// Bedside warm candle/lamp glow rises gently as twilight deepens
	candleIntensity := nightFactor * 0.78

	// Ambient sky fill: cozy deep indigo at night -> balanced warm cream-sky at noon (prevents washout)
	ambR, ambG, ambB := lerp3(0.11, 0.13, 0.23, 0.32, 0.30, 0.28, daylight)
	ambR, ambG, ambB = lerp3(ambR, ambG, ambB, 0.35, 0.24, 0.22, horizonWarmth*0.45)

	// Atelier linen cloth base reflectance: deep twilight indigo -> rich warm oatmeal-linen at noon
	linR, linG, linB := lerp3(0.22, 0.23, 0.34, 0.80, 0.74, 0.65, daylight)
	linR, linG, linB = lerp3(linR, linG, linB, 0.84, 0.70, 0.58, horizonWarmth*0.42)

	return SolarLighting{
		SunDirX:         float32(sx),
		SunDirY:         float32(sy),
		SunDirZ:         float32(sz),
		SunIntensity:    float32(sunIntensity),
		SunR:            float32(sunR),
		SunG:            float32(sunG),
		SunB:            float32(sunB),
		CandleIntensity: float32(candleIntensity),
		AmbientR:        float32(ambR),
		AmbientG:        float32(ambG),
		AmbientB:        float32(ambB),
		LinenR:          float32(linR),
		LinenG:          float32(linG),
		LinenB:          float32(linB),
	}
}
