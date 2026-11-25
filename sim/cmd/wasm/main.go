//go:build tinygo.wasm

package main

import (
	"unsafe"

	"github.com/patrickdomnick/mobile-game/sim"
)

var engine sim.Engine

func main() {
	engine.Reset()
}

//go:wasmexport sim_reset
func simReset() {
	engine.Reset()
}

//go:wasmexport sim_load_level
func simLoadLevel(idx uint32) {
	engine.LoadCuratedLevel(int(idx))
}

//go:wasmexport sim_load_mandala
func simLoadMandala(seed uint32) {
	engine.LoadMandala(seed)
}

//go:wasmexport sim_load_mandala_diff
func simLoadMandalaDiff(seed uint32, diff uint32) {
	engine.LoadMandalaWithDifficulty(seed, int(diff))
}

//go:wasmexport sim_load_daily
func simLoadDaily(dateKey uint32) {
	engine.LoadDaily(dateKey)
}

//go:wasmexport sim_set_tuning
func simSetTuning(paramID uint32, val float32) {
	engine.SetTuning(int(paramID), val)
}

//go:wasmexport sim_step
func simStep(dt float32) {
	engine.Step(dt)
}

//go:wasmexport sim_set_time_of_day
func simSetTimeOfDay(hours float32) {
	engine.SetTimeOfDayHours(hours)
}

//go:wasmexport sim_set_theme
func simSetTheme(idx uint32) {
	engine.SetTheme(int(idx))
}

//go:wasmexport sim_tap_world
func simTapWorld(wx, wz float32) uint32 {
	if engine.TapWorld(wx, wz) {
		return 1
	}
	return 0
}

//go:wasmexport sim_tap_tile
func simTapTile(idx uint32) uint32 {
	if engine.TapTile(int(idx)) {
		return 1
	}
	return 0
}

//go:wasmexport sim_undo
func simUndo() uint32 {
	if engine.Undo() {
		return 1
	}
	return 0
}

//go:wasmexport sim_hint
func simHint() int32 {
	return int32(engine.ComputeHint())
}

//go:wasmexport sim_trigger_active_wiggle
func simTriggerActiveWiggle() int32 {
	return int32(engine.TriggerRandomActiveWiggle())
}

//go:wasmexport sim_trigger_rainbow_wiggle
func simTriggerRainbowWiggle() int32 {
	return int32(engine.TriggerRandomRainbowWiggle())
}

//go:wasmexport sim_scene_ptr
func simScenePtr() uint32 {
	return uint32(uintptr(unsafe.Pointer(&engine.Scene[0])))
}

//go:wasmexport sim_scene_len
func simSceneLen() uint32 {
	return sim.SceneFloats
}

//go:wasmexport sim_state_ptr
func simStatePtr() uint32 {
	return uint32(uintptr(unsafe.Pointer(&engine.State[0])))
}

//go:wasmexport sim_state_len
func simStateLen() uint32 {
	return sim.StateFloats
}

//go:wasmexport sim_tiles_ptr
func simTilesPtr() uint32 {
	return uint32(uintptr(unsafe.Pointer(&engine.TileTelemetry[0])))
}

//go:wasmexport sim_tiles_len
func simTilesLen() uint32 {
	return sim.TileTelemetryFloats
}

//go:wasmexport sim_custom_level_ptr
func simCustomLevelPtr() uint32 {
	return uint32(uintptr(unsafe.Pointer(&engine.CustomLevelBuf[0])))
}

//go:wasmexport sim_custom_level_len
func simCustomLevelLen() uint32 {
	return sim.CustomLevelBufFloats
}

//go:wasmexport sim_load_custom_level
func simLoadCustomLevel(stitchCount int32) uint32 {
	if engine.LoadCustomLevel(int(stitchCount)) {
		return 1
	}
	return 0
}
