import { InstancedMesh, BoxGeometry, Matrix4, Vector3 } from 'three/webgpu'
import { RAIN } from '../config.js'
import { uniforms } from '../uniforms.js'
import { createRainMaterial } from '../tsl/rainMaterial.js'

// Instanced rain streaks; all motion happens in tsl/rainMaterial.js. The mesh
// stays at the origin because the material writes world-space positions.
export function createRain() {
  const mesh = new InstancedMesh(new BoxGeometry(RAIN.thickness, RAIN.length, RAIN.thickness), createRainMaterial(), RAIN.count)
  const identity = new Matrix4()
  for (let i = 0; i < RAIN.count; i++) mesh.setMatrixAt(i, identity) // instance matrices start zeroed
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = 'rain'
  mesh.frustumCulled = false
  mesh.renderOrder = 2

  const forward = new Vector3()
  return {
    mesh,
    // The rain patch follows the boat: tell the shader which way is forward.
    update(boatState) {
      forward.copy(boatState.heading).addScaledVector(boatState.dir, -boatState.heading.dot(boatState.dir)).normalize()
      uniforms.localForward.value.copy(forward)
    },
  }
}
