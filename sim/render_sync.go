package sim

import "math"

// IsAnimating reports whether any pearl flight, wobble, bloom, shockwave, shake, intro unravel, or queued cascade needs 60 FPS.
func (e *Engine) IsAnimating() bool {
	if e.IntroActive || e.CelebrateT > 0.005 || e.HintTileIdx >= 0 || e.ShakeAmt > 0.005 ||
		e.ColorBurstPulse > 0.005 || e.LayerBurstPulse > 0.005 || e.BlockerFlashT > 0.005 ||
		e.hasReadyQueuedTile() {
		return true
	}
	for i := range e.Flying {
		if e.Flying[i].Active {
			return true
		}
	}
	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].WobbleT > 0.005 || e.Tiles[i].JiggleT > 0.005 || e.Tiles[i].JiggleDelay > 0.005 {
			return true
		}
	}
	for i := 0; i < e.HoopCount; i++ {
		if (e.HoopPearls[i].Stitched && e.HoopPearls[i].BloomT < 0.995) || e.HoopPearls[i].ShimmerPulse > 0.005 {
			return true
		}
	}
	for i := 0; i < TrayCapacity; i++ {
		if e.TrayPulse[i] > 0.005 {
			return true
		}
	}
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > 0.005 {
			return true
		}
	}
	return false
}

func (e *Engine) spawnIntroUnravelFlight(hoopIdx, tileIdx int) bool {
	if hoopIdx < 0 || hoopIdx >= e.HoopCount || tileIdx < 0 || tileIdx >= e.TileCount {
		return false
	}
	slot := -1
	for i := range e.Flying {
		if !e.Flying[i].Active {
			slot = i
			break
		}
	}
	if slot < 0 {
		return false
	}
	hp := e.HoopPearls[hoopIdx]
	tx, tz := e.tileWorldPos(e.Tiles[tileIdx].Col, e.Tiles[tileIdx].Row)
	midX := (hp.WorldX + tx) * 0.5
	midZ := (hp.WorldZ + tz) * 0.5
	e.Flying[slot] = FlyingPearl{
		Active:      true,
		Color:       hp.Color,
		Special:     0,
		StartX:      hp.WorldX,
		StartY:      0.20,
		StartZ:      hp.WorldZ,
		CtrlX:       midX * 1.15,
		CtrlY:       1.28,
		CtrlZ:       midZ,
		EndX:        tx,
		EndY:        0.22,
		EndZ:        tz,
		Progress:    0,
		Delay:       0,
		Duration:    0.55,
		ToHoop:      false,
		ToTile:      true,
		TargetIndex: tileIdx,
	}
	return true
}

func (e *Engine) stepIntroUnravel(dt float32) {
	if !e.IntroActive {
		return
	}
	e.IntroElapsed += dt

	allLaunched := true
	for h := 0; h < e.HoopCount; h++ {
		bit := uint64(1) << uint(h)
		if (e.IntroLaunchedMask & bit) != 0 {
			continue
		}
		if e.IntroElapsed >= e.IntroLaunchTime[h] {
			ti := e.IntroTileForHoop[h]
			if e.spawnIntroUnravelFlight(h, ti) {
				e.HoopPearls[h].Stitched = false
				e.HoopPearls[h].BloomT = 0
				e.HoopPearls[h].ShimmerPulse = 0.85
				e.IntroLaunchedMask |= bit
			} else {
				allLaunched = false
			}
		} else {
			allLaunched = false
		}
	}

	if allLaunched && e.IntroHiddenMask == 0 {
		e.IntroActive = false
		for slot := 0; slot < ActiveSlots; slot++ {
			c := e.Active[slot]
			if c >= 0 && c < NumColors && e.Remain[c] > 0 {
				e.ColorGlowT[c] = 1.0
				e.triggerColorJiggle(uint8(c), 0.35)
			}
		}
	}
}

// processAutoQueue automatically resolves queued Final-Color gems the instant their lane/locks clear!
func (e *Engine) processAutoQueue(dt float32) {
	if e.AutoQueueLen == 0 || e.Phase != PhasePlaying {
		return
	}
	if e.AutoQueueCooldown > 0 {
		e.AutoQueueCooldown -= dt
		if e.AutoQueueCooldown > 0 {
			return
		}
		e.AutoQueueCooldown = 0
	}

	// Compact dead entries and fire the earliest newly playable queued tile in crisp domino order!
	w := 0
	firedIdx := -1
	for i := 0; i < e.AutoQueueLen; i++ {
		qIdx := e.AutoQueue[i]
		if qIdx < 0 || qIdx >= e.TileCount || !e.Tiles[qIdx].Alive {
			continue
		}
		if firedIdx < 0 && !isTileLockedNow(e.Tiles[:e.TileCount], qIdx) &&
			findFirstBlocker(e.Tiles[:e.TileCount], qIdx, e.GridCols, e.GridRows) < 0 {
			firedIdx = qIdx
			continue
		}
		e.AutoQueue[w] = qIdx
		w++
	}
	e.AutoQueueLen = w

	if firedIdx >= 0 {
		e.TapTile(firedIdx)
		if e.AutoQueueLen > 0 && e.Phase == PhasePlaying {
			e.AutoQueueCooldown = 0.055
		}
	}
}

// Step advances animations and updates GPU/telemetry buffers deterministically.
func (e *Engine) Step(dt float32) {
	if dt <= 0 {
		dt = FixedDT
	}
	if dt > 0.05 {
		dt = 0.05
	}

	e.FrameCount++
	e.ElapsedSec += dt

	// Drive first-load 3D Unravel Intro animation if active
	if e.IntroActive {
		e.stepIntroUnravel(dt)
	}

	// Auto-resolve queued Final-Color gems as soon as their blockers/locks vanish!
	e.processAutoQueue(dt)

	finalMode := e.IsFinalColorMode()
	if finalMode {
		e.clearHighlightsAndJiggles()
	}

	// Smooth decay on juice pulses, screenshake & temporary 3.5s double-beat interior unlock glow
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > 0 {
			e.ColorGlowT[c] -= dt * 0.285
			if e.ColorGlowT[c] < 0 {
				e.ColorGlowT[c] = 0
			}
		}
	}
	if e.ShakeAmt > 0 {
		e.ShakeAmt -= dt * 3.8
		if e.ShakeAmt < 0 {
			e.ShakeAmt = 0
		}
	}
	if e.ColorBurstPulse > 0 {
		e.ColorBurstPulse -= dt * 1.45
		if e.ColorBurstPulse < 0 {
			e.ColorBurstPulse = 0
		}
	}
	if e.LayerBurstPulse > 0 {
		e.LayerBurstPulse -= dt * 1.15
		if e.LayerBurstPulse < 0 {
			e.LayerBurstPulse = 0
		}
	}
	if e.BlockerFlashT > 0 {
		e.BlockerFlashT -= dt * 2.2
		if e.BlockerFlashT < 0 {
			e.BlockerFlashT = 0
			e.LastTappedBlockedIdx = -1
			e.LastBlockerIdx = -1
		}
	}

	for i := 0; i < e.TileCount; i++ {
		if e.Tiles[i].WobbleT > 0 {
			e.Tiles[i].WobbleT -= dt * 3.2
			if e.Tiles[i].WobbleT < 0 {
				e.Tiles[i].WobbleT = 0
			}
		}
		if e.Tiles[i].JiggleDelay > 0 {
			e.Tiles[i].JiggleDelay -= dt
			if e.Tiles[i].JiggleDelay <= 0 {
				e.Tiles[i].JiggleDelay = 0
				e.Tiles[i].JiggleT = 1.0
			}
		} else if e.Tiles[i].JiggleT > 0 {
			e.Tiles[i].JiggleT -= dt * 1.85
			if e.Tiles[i].JiggleT < 0 {
				e.Tiles[i].JiggleT = 0
			}
		}
	}

	for i := range e.Flying {
		f := &e.Flying[i]
		if !f.Active {
			continue
		}
		if f.Delay > 0 {
			f.Delay -= dt
			continue
		}
		f.Progress += dt / f.Duration
		if f.Progress >= 1.0 {
			f.Active = false
			if f.ToTile && f.TargetIndex >= 0 && f.TargetIndex < e.TileCount {
				e.IntroHiddenMask &^= (uint64(1) << uint(f.TargetIndex))
				e.Tiles[f.TargetIndex].JiggleT = 0.65
				f.ToTile = false
			} else if f.ToHoop && f.TargetIndex >= 0 && f.TargetIndex < e.HoopCount {
				e.HoopPearls[f.TargetIndex].Stitched = true
				e.HoopPearls[f.TargetIndex].BloomT = 0.22
				e.HoopPearls[f.TargetIndex].ShimmerPulse = 1.0
			} else if !f.ToHoop && !f.ToTile && f.TargetIndex >= 0 && f.TargetIndex < TrayCapacity {
				e.TrayPulse[f.TargetIndex] = 1.0
			}
		}
	}

	// Re-check intro completion immediately if final landing cleared IntroHiddenMask this tick
	if e.IntroActive && e.IntroHiddenMask == 0 {
		allLaunched := true
		for h := 0; h < e.HoopCount; h++ {
			if (e.IntroLaunchedMask & (uint64(1) << uint(h))) == 0 {
				allLaunched = false
				break
			}
		}
		if allLaunched {
			e.IntroActive = false
			for slot := 0; slot < ActiveSlots; slot++ {
				c := e.Active[slot]
				if c >= 0 && c < NumColors && e.Remain[c] > 0 {
					e.ColorGlowT[c] = 1.0
					e.triggerColorJiggle(uint8(c), 0.35)
				}
			}
		}
	}

	bloomRate := float32(4.4)
	shimmerRate := float32(1.65)
	if finalMode {
		bloomRate = 9.0
		shimmerRate = 3.2
	}
	for i := 0; i < e.HoopCount; i++ {
		hp := &e.HoopPearls[i]
		if hp.Stitched && hp.BloomT < 1.0 {
			hp.BloomT += dt * bloomRate
			if hp.BloomT > 1.0 {
				hp.BloomT = 1.0
			}
		}
		if hp.ShimmerPulse > 0 {
			hp.ShimmerPulse -= dt * shimmerRate
			if hp.ShimmerPulse < 0 {
				hp.ShimmerPulse = 0
			}
		}
	}

	for i := range e.TrayPulse {
		if e.TrayPulse[i] > 0 {
			e.TrayPulse[i] -= dt * 2.8
			if e.TrayPulse[i] < 0 {
				e.TrayPulse[i] = 0
			}
		}
	}
	if e.CelebrateT > 0 {
		e.CelebrateT -= dt * 0.55
		if e.CelebrateT < 0 {
			e.CelebrateT = 0
		}
	}

	e.syncBuffers()
}

func easeOutCubic(t float32) float32 {
	u := 1.0 - t
	return 1.0 - u*u*u
}

// easeOutBack adds a subtle physical bead-snap overshoot (~1.072x peak settling cleanly to 1.0).
func easeOutBack(t float32) float32 {
	if t <= 0 {
		return 0
	}
	if t >= 1 {
		return 1
	}
	const c1 = float32(1.45)
	const c3 = c1 + 1.0
	u := t - 1.0
	return 1.0 + c3*u*u*u + c1*u*u
}

func (e *Engine) syncBuffers() {
	e.ensureTuningDefaults()
	solar := ComputeSolarLighting(e.TimeOfDayHours)
	palTable := ThemePalettes[e.ThemeIndex%NumThemes]
	tension := e.computeTrayTension()

	// Micro-screenshake offset scaled to ShakeAmt^2 for snappy physical feel
	shakeMag := e.ShakeAmt * e.ShakeAmt * 0.14
	shakeX := float32(math.Sin(float64(e.ElapsedSec)*78.0)) * shakeMag
	shakeZ := float32(math.Cos(float64(e.ElapsedSec)*64.0)) * shakeMag

	// --- Header (16 vec4s = 64 floats) ---
	// 0: cameraPos + elapsed
	e.Scene[0] = CamPosX + shakeX
	e.Scene[1] = CamPosY
	e.Scene[2] = CamPosZ + shakeZ
	e.Scene[3] = e.ElapsedSec

	// 1: cameraTarget + fovY
	e.Scene[4] = CamTargetX + shakeX*0.5
	e.Scene[5] = CamTargetY
	e.Scene[6] = CamTargetZ + shakeZ*0.5
	e.Scene[7] = CamFovY

	// 2: sunDir + sunIntensity (scaled live by config.json lighting.topLightIntensity)
	e.Scene[8] = solar.SunDirX
	e.Scene[9] = solar.SunDirY
	e.Scene[10] = solar.SunDirZ
	e.Scene[11] = solar.SunIntensity * e.Tuning.TopLight

	// 3: sunColor + candleIntensity
	e.Scene[12] = solar.SunR
	e.Scene[13] = solar.SunG
	e.Scene[14] = solar.SunB
	e.Scene[15] = solar.CandleIntensity

	// 4: ambientSky + timeOfDayHours
	e.Scene[16] = solar.AmbientR
	e.Scene[17] = solar.AmbientG
	e.Scene[18] = solar.AmbientB
	e.Scene[19] = e.TimeOfDayHours

	// 5: deskTint + celebrateT
	e.Scene[20] = solar.DeskR
	e.Scene[21] = solar.DeskG
	e.Scene[22] = solar.DeskB
	e.Scene[23] = e.CelebrateT

	// 6: boardMeta
	e.Scene[24] = float32(e.GridCols)
	e.Scene[25] = float32(e.GridRows)
	e.Scene[26] = e.CellPitch
	e.Scene[27] = float32(e.TileCount)

	// 7: countsMeta
	flyingCount := 0
	for i := range e.Flying {
		if e.Flying[i].Active {
			flyingCount++
		}
	}
	e.Scene[28] = float32(e.HoopCount)
	e.Scene[29] = float32(e.TrayLen)
	e.Scene[30] = float32(flyingCount)
	e.Scene[31] = float32(e.Phase)

	// 8: activeColors (c0, c1, rem0, rem1)
	c0, c1 := e.Active[0], e.Active[1]
	r0, r1 := 0, 0
	if c0 >= 0 {
		r0 = e.Remain[c0]
	}
	if c1 >= 0 {
		r1 = e.Remain[c1]
	}
	e.Scene[32] = float32(c0)
	e.Scene[33] = float32(c1)
	e.Scene[34] = float32(r0)
	e.Scene[35] = float32(r1)

	// 9: boardBounds
	halfW := float32(e.GridCols) * e.CellPitch * 0.5
	halfD := float32(e.GridRows) * e.CellPitch * 0.5
	e.Scene[36] = BoardCenterX
	e.Scene[37] = BoardCenterZ
	e.Scene[38] = halfW
	e.Scene[39] = halfD

	// 10: hoopBounds + trayZ
	e.Scene[40] = HoopCenterX
	e.Scene[41] = HoopCenterZ
	e.Scene[42] = HoopRadius
	e.Scene[43] = TrayCenterZ

	// 11: themeAndSolar (themeIndex, daylightFactor, horizonWarmth, traySpacing)
	e.Scene[44] = float32(e.ThemeIndex)
	e.Scene[45] = solar.DaylightFactor
	e.Scene[46] = solar.HorizonWarmth
	e.Scene[47] = TraySpacing

	// 12: juiceFX (colorBurstPulse, colorBurstColor, layerBurstPulse, trayTension)
	e.Scene[48] = e.ColorBurstPulse
	e.Scene[49] = float32(e.ColorBurstColor)
	e.Scene[50] = e.LayerBurstPulse
	e.Scene[51] = tension

	// 13: blockerFX (tappedX, tappedZ, blockerX, blockerZ)
	txB, tzB, bxB, bzB := float32(0), float32(0), float32(0), float32(0)
	if e.BlockerFlashT > 0.01 && e.LastTappedBlockedIdx >= 0 && e.LastTappedBlockedIdx < e.TileCount {
		t0 := e.Tiles[e.LastTappedBlockedIdx]
		txB, tzB = e.tileWorldPos(t0.Col, t0.Row)
		if e.LastBlockerIdx >= 0 && e.LastBlockerIdx < e.TileCount {
			tb := e.Tiles[e.LastBlockerIdx]
			bxB, bzB = e.tileWorldPos(tb.Col, tb.Row)
		} else {
			bxB, bzB = txB, tzB
		}
	}
	e.Scene[52] = txB
	e.Scene[53] = tzB
	e.Scene[54] = bxB
	e.Scene[55] = bzB

	// 14: extraFX (blockerFlashT, streakFloat, layersDoneRatio, hintIdx)
	layerRatio := float32(0)
	if e.TotalLayers > 0 {
		layerRatio = float32(e.LayersComplete) / float32(e.TotalLayers)
	}
	e.Scene[56] = e.BlockerFlashT
	e.Scene[57] = float32(e.Streak)
	e.Scene[58] = layerRatio
	e.Scene[59] = float32(e.HintTileIdx)

	// 15: reserved (multiplier, nextQueuedColor, levelIndex, spotlightMaxGlowT)
	maxGlow := float32(0)
	for c := 0; c < NumColors; c++ {
		if e.ColorGlowT[c] > maxGlow {
			maxGlow = e.ColorGlowT[c]
		}
	}
	e.Scene[60] = float32(e.currentMultiplier())
	e.Scene[61] = float32(e.nextQueuedColor())
	e.Scene[62] = float32(e.LevelIndex)
	e.Scene[63] = maxGlow

	// --- Palette (6 vec4s) ---
	for c := 0; c < NumColors; c++ {
		base := SceneHeaderFloats + c*4
		e.Scene[base+0] = palTable[c][0]
		e.Scene[base+1] = palTable[c][1]
		e.Scene[base+2] = palTable[c][2]
		e.Scene[base+3] = palTable[c][3]
	}

	// --- Board Tiles (64 * 8 floats) & TileTelemetry ---
	pearlRad := e.CellPitch * 0.245
	finalModeNow := e.IsFinalColorMode()
	for i := 0; i < MaxGridTiles; i++ {
		sBase := SceneTileOffset + i*8
		tBase := i * TileTelemetryStride
		if i >= e.TileCount {
			for k := 0; k < 8; k++ {
				e.Scene[sBase+k] = 0
				e.TileTelemetry[tBase+k] = 0
			}
			continue
		}
		t := e.Tiles[i]
		wx, wz := e.tileWorldPos(t.Col, t.Row)
		unblocked := t.Alive && isTileUnblocked(e.Tiles[:e.TileCount], i, e.GridCols, e.GridRows)
		adjMask := uint32(0)
		lockedNow := false
		if t.Alive && t.Special == SpecialLocked && !t.Unlocked {
			adjMask = adjacentAliveDirMask(e.Tiles[:e.TileCount], i)
			lockedNow = adjMask != 0
		}
		hiddenConcealed := t.Alive && t.Special == SpecialHidden && !t.Revealed
		playable := unblocked && !lockedNow

		ox, oz := float32(0), float32(0)
		if t.WobbleT > 0 {
			w := float32(math.Sin(float64(t.WobbleT)*math.Pi*3.0)) * t.WobbleT * 0.085
			switch t.Dir {
			case DirUp:
				oz = -w
			case DirRight:
				ox = w
			case DirDown:
				oz = w
			case DirLeft:
				ox = -w
			}
		}

		// IMPORTANT: Zero-spoiler flags! (Bit 2 is NEVER set!)
		// Bit 1 (1) = alive
		// Bit 4 (4) = hinted
		// Bit 8 (8) = blocker flash
		// Bit 16 (16) = player-queued auto-resolve gem (Final-Color Mode only)
		// Bit 32 (32) = 3D Heart-Shaped Pearl
		// Bit 64 (64) = Rainbow Wild Pearl
		// Bit 128 (128) = Hidden Pearl (currently concealed black)
		// Bit 256 (256) = Locked Pearl (currently locked by adjacent pearls)
		// Bits 1024/2048/4096/8192 = N/E/S/W orthogonal neighbor lock bars!
		introHidden := e.IntroActive && (e.IntroHiddenMask&(uint64(1)<<uint(i))) != 0
		flags := uint32(0)
		if t.Alive && !introHidden {
			flags |= 1
		}
		if i == e.HintTileIdx {
			flags |= 4
		}
		if e.BlockerFlashT > 0.01 && (i == e.LastBlockerIdx || i == e.LastTappedBlockedIdx) {
			flags |= 8
		}
		if t.Alive && e.isTileQueued(i) {
			flags |= 16
		}
		if t.IsHeart || t.Special == SpecialHeart {
			flags |= 32
		}
		if t.Special == SpecialRainbow {
			flags |= 64
		}
		if hiddenConcealed {
			flags |= 128
		}
		if lockedNow {
			flags |= 256 | (adjMask << 10)
		}

		// Suppress interior active-color glow on concealed Hidden pearls, Rainbow pearls, AND Final-Color Mode!
		glowVal := e.ColorGlowT[t.Color] * e.Tuning.GlowIntensity
		if hiddenConcealed || t.Special == SpecialRainbow || finalModeNow || e.IntroActive {
			glowVal = 0
		}

		e.Scene[sBase+0] = wx + ox
		e.Scene[sBase+1] = 0.22 + t.JiggleT*0.10*e.Tuning.JiggleIntensity
		e.Scene[sBase+2] = wz + oz
		e.Scene[sBase+3] = pearlRad
		e.Scene[sBase+4] = float32(t.Color)
		e.Scene[sBase+5] = float32(t.Dir)
		e.Scene[sBase+6] = float32(flags)
		e.Scene[sBase+7] = glowVal

		e.TileTelemetry[tBase+0] = float32(t.Col)
		e.TileTelemetry[tBase+1] = float32(t.Row)
		e.TileTelemetry[tBase+2] = float32(t.Color)
		e.TileTelemetry[tBase+3] = float32(t.Dir)
		if t.Alive {
			switch t.Special {
			case SpecialHeart:
				e.TileTelemetry[tBase+4] = 2
			case SpecialRainbow:
				e.TileTelemetry[tBase+4] = 3
			case SpecialHidden:
				if t.Revealed {
					e.TileTelemetry[tBase+4] = 5
				} else {
					e.TileTelemetry[tBase+4] = 4
				}
			case SpecialLocked:
				if lockedNow {
					e.TileTelemetry[tBase+4] = 6
				} else {
					e.TileTelemetry[tBase+4] = 7
				}
			default:
				if t.IsHeart {
					e.TileTelemetry[tBase+4] = 2
				} else {
					e.TileTelemetry[tBase+4] = 1
				}
			}
		} else {
			e.TileTelemetry[tBase+4] = 0
		}
		if playable {
			e.TileTelemetry[tBase+5] = 1
		} else {
			e.TileTelemetry[tBase+5] = 0
		}
		e.TileTelemetry[tBase+6] = wx
		e.TileTelemetry[tBase+7] = wz
	}

	// --- Embroidery Hoop Pearls (64 * 8 floats) ---
	stitchedCount := 0
	hoopPearlR := float32(0.125)
	if e.HoopCount > 50 {
		hoopPearlR = 0.090
	} else if e.HoopCount > 34 {
		hoopPearlR = 0.102
	} else if e.HoopCount > 24 {
		hoopPearlR = 0.115
	}

	for i := 0; i < MaxHoopPearls; i++ {
		base := SceneHoopOffset + i*8
		if i >= e.HoopCount {
			for k := 0; k < 8; k++ {
				e.Scene[base+k] = 0
			}
			continue
		}
		hp := e.HoopPearls[i]
		if hp.Claimed {
			stitchedCount++
		}
		bloom := float32(0)
		if hp.Stitched {
			bloom = easeOutBack(hp.BloomT)
		}
		activeFlag := float32(0)
		if !hp.Claimed && !e.IntroActive && e.isActiveColor(hp.Color) {
			activeFlag = 1
		}

		e.Scene[base+0] = hp.WorldX
		e.Scene[base+1] = 0.08 + hoopPearlR*0.65*bloom
		e.Scene[base+2] = hp.WorldZ
		e.Scene[base+3] = hoopPearlR
		e.Scene[base+4] = float32(hp.Color)
		e.Scene[base+5] = bloom
		e.Scene[base+6] = hp.ShimmerPulse
		e.Scene[base+7] = activeFlag
	}

	// --- 5-Slot Silk Holding Tray Pearls ---
	for i := 0; i < TrayCapacity; i++ {
		base := SceneTrayOffset + i*8
		tx, tz := e.traySlotWorldPos(i)
		occupied := i < e.TrayLen
		inbound := false
		for fi := range e.Flying {
			if e.Flying[fi].Active && !e.Flying[fi].ToHoop && !e.Flying[fi].ToTile && e.Flying[fi].TargetIndex == i {
				inbound = true
				break
			}
		}
		trayBounce := float32(0)
		if e.TrayPulse[i] > 0.005 {
			trayBounce = float32(math.Sin(float64(e.TrayPulse[i])*math.Pi)) * e.TrayPulse[i] * 0.048
		}
		e.Scene[base+0] = tx
		e.Scene[base+1] = 0.19 + trayBounce
		e.Scene[base+2] = tz
		e.Scene[base+3] = 0.175 * (1.0 + trayBounce*0.95)
		if occupied && !inbound {
			e.Scene[base+4] = float32(e.Tray[i])
			e.Scene[base+5] = 1
		} else {
			e.Scene[base+4] = 0
			e.Scene[base+5] = 0
		}
		e.Scene[base+6] = e.TrayPulse[i]
		e.Scene[base+7] = tension
	}

	// --- Flying Pearls (12 * 8 floats) ---
	for i := 0; i < MaxFlying; i++ {
		base := SceneFlyingOffset + i*8
		f := e.Flying[i]
		if !f.Active || f.Delay > 0 {
			for k := 0; k < 8; k++ {
				e.Scene[base+k] = 0
			}
			continue
		}
		t := easeOutCubic(f.Progress)
		inv := 1.0 - t
		px := inv*inv*f.StartX + 2*inv*t*f.CtrlX + t*t*f.EndX
		py := inv*inv*f.StartY + 2*inv*t*f.CtrlY + t*t*f.EndY
		pz := inv*inv*f.StartZ + 2*inv*t*f.CtrlZ + t*t*f.EndZ

		e.Scene[base+0] = px
		e.Scene[base+1] = py
		e.Scene[base+2] = pz
		e.Scene[base+3] = 0.165
		e.Scene[base+4] = float32(f.Color)
		e.Scene[base+5] = 1.0
		e.Scene[base+6] = t
		e.Scene[base+7] = float32(f.Special)
	}

	// --- Compact Telemetry State Buffer (68 floats) ---
	e.State[0] = float32(e.FrameCount)
	e.State[1] = e.ElapsedSec
	e.State[2] = float32(e.LevelIndex)
	e.State[3] = float32(e.Mode)
	e.State[4] = float32(e.Phase)
	e.State[5] = e.TimeOfDayHours
	if e.IsAnimating() {
		e.State[6] = 1
	} else {
		e.State[6] = 0
	}
	e.State[7] = float32(e.Score)
	e.State[8] = float32(len(e.undoStack))
	e.State[9] = float32(stitchedCount)
	e.State[10] = float32(e.HoopCount)
	e.State[11] = float32(e.Active[0])
	e.State[12] = float32(e.Active[1])
	e.State[13] = float32(r0)
	e.State[14] = float32(r1)
	e.State[15] = float32(e.TrayLen)
	for i := 0; i < TrayCapacity; i++ {
		if i < e.TrayLen {
			e.State[16+i] = float32(e.Tray[i])
		} else {
			e.State[16+i] = -1
		}
	}
	e.State[21] = float32(e.HintTileIdx)
	e.State[22] = float32(e.GridCols)
	e.State[23] = float32(e.GridRows)
	e.State[24] = float32(e.TileCount)
	e.State[25] = float32(e.StitchEvents)
	e.State[26] = float32(e.LastStitchCol)
	e.State[27] = float32(e.TrayEvents)
	e.State[28] = float32(e.BlockedEvents)
	e.State[29] = float32(e.UndoEvents)
	e.State[30] = float32(e.CompleteEvents)
	e.State[31] = solar.DaylightFactor

	// v2.0 Extended Balatro/VS telemetry
	e.State[32] = float32(e.ThemeIndex)
	e.State[33] = float32(e.Streak)
	e.State[34] = float32(e.MaxStreak)
	e.State[35] = float32(e.currentMultiplier())
	e.State[36] = float32(e.DirectCount)
	e.State[37] = float32(e.TrayUses)
	e.State[38] = float32(e.UndoUsed)
	e.State[39] = float32(e.Stars)
	e.State[40] = float32(e.LayersComplete)
	e.State[41] = float32(e.TotalLayers)
	e.State[42] = float32(e.ColorClearEvents)
	e.State[43] = float32(e.LayerClearEvents)
	e.State[44] = float32(e.LastScoreDelta)
	e.State[45] = float32(e.LastBlockerIdx)
	e.State[46] = e.LastEventWorldX
	e.State[47] = e.LastEventWorldZ
	e.State[48] = float32(e.HintsUsed)
	e.State[49] = float32(e.HintEvents)
	e.State[50] = float32(e.LastPenaltyDelta)
	e.State[51] = float32(e.ChapterIndex)
	e.State[52] = float32(e.LastSeed & 0xFFFF)
	e.State[53] = float32(e.LastSeed >> 16)
	e.State[54] = float32(e.HeartClearEvents)
	e.State[55] = float32(e.LastHeartBonus)
	e.State[56] = float32(e.RainbowClearEvents)
	e.State[57] = float32(e.HiddenRevealEvents)
	e.State[58] = float32(e.LockBreakEvents)
	e.State[59] = float32(e.LockedTapEvents)
	e.State[60] = float32(e.SeedDifficulty)
	if e.IsFinalColorMode() {
		e.State[61] = 1
	} else {
		e.State[61] = 0
	}
	e.State[62] = float32(e.AutoQueueLen)
	e.State[63] = float32(e.QueueEvents)
	if e.IntroActive {
		e.State[64] = 1
		if e.IntroDuration > 0.01 {
			p := e.IntroElapsed / e.IntroDuration
			if p > 1 {
				p = 1
			}
			e.State[65] = p
		} else {
			e.State[65] = 0
		}
	} else {
		e.State[64] = 0
		e.State[65] = 1
	}
	e.State[66] = float32(e.CustomSpecialMask)
	e.State[67] = float32(e.CustomColorCount)
}
