import { Mesh, SphereGeometry } from 'three/webgpu'
import { createSkyMaterial } from '../tsl/skyMaterial.js'

// Sky dome. It is drawn first and ignores depth, so everything else paints over
// it; it follows the camera so it is always infinitely far away.
export function createSky() {
  const mesh = new Mesh(new SphereGeometry(90, 32, 16), createSkyMaterial())
  mesh.name = 'sky'
  mesh.frustumCulled = false
  mesh.renderOrder = -10

  return {
    mesh,
    update(camera) {
      mesh.position.copy(camera.position)
    },
  }
}
