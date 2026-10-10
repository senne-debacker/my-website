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
  let yaw = 0 // look round the boat: 0 = from behind, +-PI = from the front (set by dragging)
  let pitch = 0 // 0 = the normal height, up = higher, down = lower (as a fraction of CAMERA.height)
  let idle = 0 // seconds since the player last dragged
  const back = new Vector3()

  function apply() {
    forward.copy(heading).addScaledVector(dir, -heading.dot(dir)).normalize()
    camera.up.copy(dir) // "up" is away from the planet centre, not world +Y
    back.copy(forward).negate().applyAxisAngle(dir, yaw) // from the boat towards the camera, along the ground
    camera.position.copy(dir).multiplyScalar(PLANET.radius + CAMERA.height * zoom * (1 + pitch)).addScaledVector(back, CAMERA.distance * zoom)
    // looking round the side, the look-at point moves from ahead of the boat to the boat itself
    lookAt.copy(dir).multiplyScalar(PLANET.radius + CAMERA.lookHeight).addScaledVector(forward, CAMERA.lookAhead * (0.5 + 0.5 * Math.cos(yaw)))
    camera.lookAt(lookAt)
  }

  return {
    snap(state) {
      dir.copy(state.dir)
      heading.copy(state.heading)
      apply()
    },
    // `dragging`: the mouse button is down; `driving`: the player is pressing forward. After
    // `CAMERA.lookReturnDelay` seconds without a drag, or as soon as the player drives ahead, the
    // dragged view eases back to the normal one (slowly, `CAMERA.lookReturnRate`).
    update(state, delta, dragging = false, driving = false) {
      idle = dragging ? 0 : idle + delta
      if (!dragging && (driving || idle > CAMERA.lookReturnDelay)) {
        const k = 1 - Math.exp(-CAMERA.lookReturnRate * delta)
        yaw -= yaw * k
        pitch -= pitch * k
      }
      dir.lerp(state.dir, 1 - Math.exp(-CAMERA.follow * delta)).normalize()
      heading.lerp(state.heading, 1 - Math.exp(-CAMERA.swing * delta))
      apply()
    },
    // Drag: `dx`, `dy` in radians. Looking round is unlimited, the height is kept above the water.
    look(dx, dy) {
      idle = 0
      yaw = (yaw + dx + Math.PI * 3) % (Math.PI * 2) - Math.PI
      pitch = Math.min(CAMERA.maxPitch, Math.max(CAMERA.minPitch, pitch + dy))
    },
    resetLook() {
      yaw = 0
      pitch = 0
    },
    zoomBy(factor) {
      zoom = Math.min(CAMERA.maxZoom, Math.max(CAMERA.minZoom, zoom * factor))
    },
  }
}
