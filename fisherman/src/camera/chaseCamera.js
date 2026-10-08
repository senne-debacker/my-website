import { Vector3 } from 'three/webgpu'
import { PLANET, CAMERA } from '../config.js'

// Third-person camera behind the boat. It is built from the boat's *sphere*
// frame (position `dir`, heading) and ignores the wave tilt on purpose, so the
// horizon stays calm even in a storm. Both are low-pass filtered: position
// follows quickly, heading swings round a little slower when the boat turns.
export function createChaseCamera(camera) {
  const dir = new Vector3()
  const heading = new Vector3()
  const forward = new Vector3()
  const lookAt = new Vector3()
  let zoom = 1

  function apply() {
    forward.copy(heading).addScaledVector(dir, -heading.dot(dir)).normalize()
    camera.up.copy(dir) // "up" is away from the planet centre, not world +Y
    camera.position.copy(dir).multiplyScalar(PLANET.radius + CAMERA.height * zoom).addScaledVector(forward, -CAMERA.distance * zoom)
    lookAt.copy(dir).multiplyScalar(PLANET.radius + CAMERA.lookHeight).addScaledVector(forward, CAMERA.lookAhead)
    camera.lookAt(lookAt)
  }

  return {
    snap(state) {
      dir.copy(state.dir)
      heading.copy(state.heading)
      apply()
    },
    update(state, delta) {
      dir.lerp(state.dir, 1 - Math.exp(-CAMERA.follow * delta)).normalize()
      heading.lerp(state.heading, 1 - Math.exp(-CAMERA.swing * delta))
      apply()
    },
    zoomBy(factor) {
      zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom * factor))
    },
  }
}
