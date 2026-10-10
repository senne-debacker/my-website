import { Vector3 } from 'three/webgpu'
import { PLANET, CAMERA, INTRO } from '../config.js'

const R = PLANET.radius
const DEG = Math.PI / 180
const forward = new Vector3()
const port = new Vector3()
const horizontal = new Vector3()
const target = new Vector3()

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const lerp = (a, b, t) => a + (b - a) * t
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) // ease in and out

// A camera pose is described in the boat's own sphere frame: where it stands (an azimuth
// round the boat, a distance and a height) and what it looks at (a point ahead of the boat
// and a height above it).
const TITLE = { azimuth: INTRO.azimuth, radius: INTRO.radius, height: INTRO.height, lookAhead: INTRO.lookAhead, lookHeight: INTRO.lookHeight, fov: INTRO.fov }
// ... and the chase camera in the same terms, so the two can be blended exactly:
// 180 degrees = straight behind, at CAMERA.distance, CAMERA.height up, looking CAMERA.lookAhead ahead.
const CHASE = { azimuth: 180, radius: CAMERA.distance, height: CAMERA.height, lookAhead: CAMERA.lookAhead, lookHeight: CAMERA.lookHeight, fov: 55 }

// The title-screen camera and the swing from it to the chase camera.
export function createIntroCamera(camera) {
  return {
    // blend 0 = title view, 1 = chase view. `time` adds a slow sway to the title view.
    update(state, blend, time) {
      const s = ease(clamp01(blend))
      const sway = Math.sin(time * INTRO.swaySpeed * Math.PI * 2) * INTRO.swayDegrees * (1 - s)
      const azimuth = lerp(TITLE.azimuth + sway, CHASE.azimuth, s) * DEG // increasing = round the port side

      forward.copy(state.heading).addScaledVector(state.dir, -state.heading.dot(state.dir)).normalize()
      port.crossVectors(state.dir, forward)
      horizontal.copy(forward).multiplyScalar(Math.cos(azimuth)).addScaledVector(port, Math.sin(azimuth))

      camera.up.copy(state.dir) // "up" is away from the planet centre
      camera.position
        .copy(state.dir)
        .multiplyScalar(R + lerp(TITLE.height, CHASE.height, s))
        .addScaledVector(horizontal, lerp(TITLE.radius, CHASE.radius, s))
      target
        .copy(state.dir)
        .multiplyScalar(R + lerp(TITLE.lookHeight, CHASE.lookHeight, s))
        .addScaledVector(forward, lerp(TITLE.lookAhead, CHASE.lookAhead, s))
      camera.lookAt(target)

      const fov = lerp(TITLE.fov, CHASE.fov, s)
      if (camera.fov !== fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
    },
  }
}
