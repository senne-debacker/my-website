import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PLANET } from '../config.js'
import { createChaseCamera } from './chaseCamera.js'
import { createIntroCamera } from './introCamera.js'

// The ways to look at the planet:
//   title   a close-up of the boat for the start screen (camera/introCamera.js)
//   pan     the swing from the title view round to behind the boat, started by `pan()`
//   chase   the game camera
//   planet  a free orbit around the planet's centre
// OrbitControls reads camera.up only when it is created, so the orbit controls are rebuilt
// whenever we switch to them.
export function createCameraRig(camera, domElement, state) {
  const chase = createChaseCamera(camera)
  const intro = createIntroCamera(camera)
  const opening = { phase: 'title', t: 0, seconds: 1, onDone: null } // phase: title -> panning -> done
  let orbit = null

  chase.snap(state)

  addEventListener('wheel', (event) => {
    if (!orbit && opening.phase === 'done') chase.zoomBy(Math.exp(event.deltaY * 0.001)) // not during the title and the swing round
  }, { passive: true })

  function enterOrbit() {
    camera.up.set(0, 1, 0)
    camera.position.copy(state.dir).multiplyScalar(PLANET.radius * 2.8).add({ x: 0.3, y: 0.8, z: 0.3 })
    orbit = new OrbitControls(camera, domElement)
    orbit.enableDamping = true
    orbit.minDistance = PLANET.radius * 1.3
    orbit.maxDistance = PLANET.radius * 6
    orbit.update()
  }

  function leaveOrbit() {
    orbit.dispose()
    orbit = null
    chase.snap(state)
  }

  return {
    get mode() {
      return orbit ? 'planet' : 'chase'
    },

    // Swing from the title view to the chase view over `seconds`, then call `onDone`.
    pan(seconds, onDone) {
      opening.phase = 'panning'
      opening.t = 0
      opening.seconds = seconds
      opening.onDone = onDone
    },

    update(delta, planetView, time = 0) {
      if (opening.phase !== 'done') {
        if (opening.phase === 'panning') opening.t += delta / opening.seconds
        const finished = opening.t >= 1
        intro.update(state, finished ? 1 : opening.t, time)
        if (finished) {
          opening.phase = 'done'
          chase.snap(state) // hand over to the chase camera: it is at exactly this pose
          opening.onDone?.()
        }
        return
      }

      if (planetView && !orbit) enterOrbit()
      else if (!planetView && orbit) leaveOrbit()

      if (orbit) orbit.update()
      else chase.update(state, delta)
    },
  }
}
