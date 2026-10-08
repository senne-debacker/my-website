import { Vector3, Quaternion, Matrix4 } from 'three/webgpu'
import { PLANET, BOAT } from '../config.js'
import { sampleHeight, surfacePoint } from './waves.js'

// Boat state on the planet:
//   dir      where it is (a unit vector from the planet centre)
//   heading  which way the bow points (any vector; projected onto the tangent plane when used)
//   vel      velocity over the water, a vector in the tangent plane (units / s). It is not
//            always along the heading: the boat slips sideways a little in turns and gets
//            knocked about by collisions
//   yawRate  turning speed (rad / s, positive = to port)
//   speed    vel . forward (signed; negative = astern), kept up to date for HUD, wake, sound
//   accel    smoothed change of `speed` (units / s^2), used to pitch the hull
// physics/boatMotion.js advances it; physics/collision.js keeps it out of land.
export function createBoatState(dir, heading) {
  return {
    dir: dir.clone().normalize(),
    heading: heading.clone(),
    vel: new Vector3(),
    yawRate: 0,
    speed: 0,
    accel: 0,
  }
}

export function createBoatPose() {
  return { position: new Vector3(), quaternion: new Quaternion(), normal: new Vector3() }
}

// Scratch objects, so the per-frame update does not allocate.
const forward0 = new Vector3()
const right0 = new Vector3()
const sampleDir = new Vector3()
const pFront = new Vector3()
const pBack = new Vector3()
const pLeft = new Vector3()
const pRight = new Vector3()
const alongBeam = new Vector3()
const alongKeel = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const back = new Vector3()
const basis = new Matrix4()

// Point on the water surface `f` metres ahead and `s` metres to starboard of
// the boat, measured along the sphere's tangent plane.
function surfaceAt(dir, f, s, time, storm, target) {
  sampleDir.copy(dir).multiplyScalar(PLANET.radius).addScaledVector(forward0, f).addScaledVector(right0, s).normalize()
  return surfacePoint(sampleDir, time, storm, target)
}

// Floating: the hull rests on the plane through four wave samples (bow, stern,
// port, starboard). The plane's normal is the boat's up vector and the mean
// height of the samples (plus the centre) is how high the boat sits. Uses the
// same wave field as the water shader, see physics/waves.js. `footprint` (two
// half-sizes) defaults to the boat; buoys pass a smaller one.
export function computeBoatPose(state, time, storm, pose, footprint = BOAT) {
  const { dir } = state

  // Tangent frame at the boat: forward0 (bow) and right0 (starboard).
  forward0.copy(state.heading).addScaledVector(dir, -state.heading.dot(dir)).normalize()
  right0.crossVectors(forward0, dir)

  surfaceAt(dir, footprint.sampleHalfLength, 0, time, storm, pFront)
  surfaceAt(dir, -footprint.sampleHalfLength, 0, time, storm, pBack)
  surfaceAt(dir, 0, footprint.sampleHalfWidth, time, storm, pRight)
  surfaceAt(dir, 0, -footprint.sampleHalfWidth, time, storm, pLeft)

  // Height: mean wave height over the hull footprint.
  const heights = pFront.length() + pBack.length() + pRight.length() + pLeft.length() - 4 * PLANET.radius
  const height = (heights + sampleHeight(dir, time, storm)) / 5
  pose.position.copy(dir).multiplyScalar(PLANET.radius + height)

  // Tilt: normal of the plane spanned by the keel and the beam directions.
  alongBeam.subVectors(pRight, pLeft)
  alongKeel.subVectors(pFront, pBack)
  pose.normal.crossVectors(alongBeam, alongKeel).normalize() // right x forward = up

  // Orientation: up = normal, bow = heading projected onto the water plane.
  forward.copy(forward0).addScaledVector(pose.normal, -forward0.dot(pose.normal)).normalize()
  right.crossVectors(forward, pose.normal)
  back.copy(forward).negate() // the model's bow points along local -Z
  basis.makeBasis(right, pose.normal, back)
  pose.quaternion.setFromRotationMatrix(basis)

  return pose
}
