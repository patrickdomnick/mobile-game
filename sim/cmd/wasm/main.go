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

//go:wasmexport sim_step
func simStep(dt float32) {
	engine.Step(dt)
}

//go:wasmexport sim_set_pointer
func simSetPointer(nx, nz float32, active uint32) {
	engine.SetPointerNormalized(nx, nz, active != 0)
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
