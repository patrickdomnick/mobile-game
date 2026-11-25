package sim

import "math"

// SolarLighting captures continuous 24-hour real-world lighting parameters
// with dramatic yet smooth C1 interpolation across Dawn, Noon, Golden Hour, and Night.
type SolarLighting struct {
	SunDirX, SunDirY, SunDirZ    float32
	SunIntensity                 float32
	SunR, SunG, SunB             float32
	CandleIntensity              float32
	AmbientR, AmbientG, AmbientB float32
	DeskR, DeskG, DeskB          float32
	DaylightFactor               float32
	HorizonWarmth                float32
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
// to studio window sunlight, vivid golden/rose horizon light, and deep candlelit night.
func ComputeSolarLighting(hours float32) SolarLighting {
	h := math.Mod(float64(hours), 24.0)
	if h < 0 {
		h += 24.0
	}

	// Solar elevation proxy: peaks smoothly at 13:00, lowest at 01:00
	dayAngle := ((h - 7.0) / 24.0) * 2.0 * math.Pi
	sinElev := math.Sin(dayAngle)

	// Smooth daylight [0 = midnight, 1 = sunlit noon]
	daylight := smoothstep(-0.36, 0.46, sinElev)
	// Rich dawn/sunset horizon glow centered near sunrise (~06:30) and sunset (~18:30)
	horizonWarmth := math.Exp(-math.Pow((sinElev-0.02)/0.30, 2.0))
	// Deep night factor driving warm candle/lamp glow & silver moonlight
	nightFactor := 1.0 - smoothstep(-0.38, 0.18, sinElev)

	// Dramatic sun azimuth sweep east -> south -> west across the studio window
	azimuth := lerp(-1.15, 1.15, smoothstep(5.0, 20.5, h))
	elev := lerp(0.66, 1.16, daylight)

	sx := math.Cos(elev) * math.Sin(azimuth)
	sy := math.Sin(elev)
	sz := math.Cos(elev) * math.Cos(azimuth) * 0.55 - 0.12
	slen := math.Sqrt(sx*sx + sy*sy + sz*sz)
	if slen < 1e-5 {
		slen = 1
	}
	sx /= slen
	sy /= slen
	sz /= slen

	// Key light: cool silver-blue moonlight -> fiery golden-coral dawn/sunset -> crisp sunlit white-gold
	sunR, sunG, sunB := lerp3(0.46, 0.58, 0.96, 1.00, 0.97, 0.90, daylight)
	sunR, sunG, sunB = lerp3(sunR, sunG, sunB, 1.00, 0.56, 0.24, horizonWarmth*0.84)

	sunIntensity := lerp(0.46, 1.12, daylight) + horizonWarmth*0.22
	candleIntensity := nightFactor * 0.95

	// Ambient sky fill: deep twilight sapphire at night -> vibrant sunlit sky tint at noon
	ambR, ambG, ambB := lerp3(0.10, 0.12, 0.26, 0.36, 0.38, 0.44, daylight)
	ambR, ambG, ambB = lerp3(ambR, ambG, ambB, 0.44, 0.24, 0.26, horizonWarmth*0.62)

	// Rich high-contrast Jewel Atelier desk base (deep indigo-slate night -> warm sunlit slate-teal/walnut day)
	// Keeps dark-to-medium richness so bright jewel pearls & ivory hoop POP dramatically at every hour!
	deskR, deskG, deskB := lerp3(0.09, 0.11, 0.22, 0.24, 0.30, 0.34, daylight)
	deskR, deskG, deskB = lerp3(deskR, deskG, deskB, 0.34, 0.20, 0.22, horizonWarmth*0.58)

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
		DeskR:           float32(deskR),
		DeskG:           float32(deskG),
		DeskB:           float32(deskB),
		DaylightFactor:  float32(daylight),
		HorizonWarmth:   float32(horizonWarmth),
	}
}
