// Checks of the screen-relative joystick for planet view (src/camera/screenSteer.js), part of `npm run check`.
import { PerspectiveCamera, Vector3 } from 'three/webgpu'
import { screenSteer } from '../src/camera/screenSteer.js'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

// The camera looks at the planet's centre from +z; the boat sits on the near side (at +z), bow pointing up the screen (+y).
const makeCamera = (position, up = new Vector3(0, 1, 0)) => {
  const camera = new PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.copy(position)
  camera.up.copy(up)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  camera.updateProjectionMatrix()
  return camera
}
const boat = (dir, heading) => ({ dir: new Vector3(...dir).normalize(), heading: new Vector3(...heading).normalize() })
const state = boat([0, 0, 1], [0, 1, 0])
const camera = makeCamera(new Vector3(0, 0, 20))
const go = (x, y, s = state, c = camera) => screenSteer(s, c, { x, y }, 1)

let r = go(0, 1)
check('stick up, bow up on the screen: straight on, full throttle', Math.abs(r.steer) < 1e-6 && Math.abs(r.throttle - 1) < 1e-6, `steer ${r.steer.toFixed(3)} throttle ${r.throttle.toFixed(2)}`)
r = go(1, 0)
check('stick right, bow up: turn to starboard (+)', r.steer > 0.9, `steer ${r.steer.toFixed(2)}`)
r = go(-1, 0)
check('stick left, bow up: turn to port (-)', r.steer < -0.9)
r = go(0.2, 1)
check('stick a little right of the bow: a gentle starboard turn', r.steer > 0.1 && r.steer < 0.5, `steer ${r.steer.toFixed(2)}`)
r = go(0, -1)
check('stick down, bow up: full helm and the throttle eased (way on is kept)', Math.abs(r.steer) === 1 && r.throttle > 0.4 && r.throttle < 0.7, `throttle ${r.throttle.toFixed(2)}`)
r = go(0, 0.5)
check('a half push is half the throttle', Math.abs(r.throttle - 0.5) < 1e-6)
r = go(0, 0)
check('no push: no throttle, no helm', r.throttle === 0 && r.steer === 0)

// Same boat, the camera turned upside down: the bow now points DOWN the screen.
const upside = makeCamera(new Vector3(0, 0, 20), new Vector3(0, -1, 0))
r = go(0, -1, state, upside)
check('camera upside down: stick down is now straight on', Math.abs(r.steer) < 1e-6 && r.throttle > 0.99)
r = go(1, 0, state, upside)
check('camera upside down: stick right is now to port', r.steer < -0.9, `steer ${r.steer.toFixed(2)}`)

// Camera turned a quarter round: the bow points to the right of the screen.
const quarter = makeCamera(new Vector3(0, 0, 20), new Vector3(1, 0, 0)) // the world's +y now appears at the side of the screen
const sideways = go(0, 1, state, quarter)
const other = go(0, -1, state, quarter)
check('camera turned sideways: stick up / down is across the bow, one each way', Math.sign(sideways.steer) === -Math.sign(other.steer) && Math.abs(sideways.steer) === 1)

// Boat on the far side of the planet (seen through it, mirrored): the helm turns the other way so that the boat still goes where the stick points on the screen.
const far = boat([0, 0, -1], [0, 1, 0])
const near = go(1, 0)
const farR = go(1, 0, far)
check('boat on the far side: the mirrored view flips the helm', Math.sign(near.steer) === -Math.sign(farR.steer), `near ${near.steer.toFixed(2)} far ${farR.steer.toFixed(2)}`)

if (failures) {
  console.error(`\n${failures} screen-steer check(s) failed`)
  process.exit(1)
}
console.log('\nall screen-steer checks passed')
