import { Vector3, Matrix4 } from 'three/webgpu'
import { PLANET, BOAT } from '../config.js'

const R = PLANET.radius
const W = BOAT.weight

const forward = new Vector3()
const right = new Vector3()
const back = new Vector3()
const targetUp = new Vector3()
const acceleration = new Vector3()
const basis = new Matrix4()

const clamp = (x, min, max) => Math.min(max, Math.max(min, x))

export function createBoatDynamics() {
  return { ready: false, height: 0, heightVelocity: 0, up: new Vector3(), upVelocity: new Vector3() }
}

// Gives the hull weight. `target` is what computeBoatPose() returns: the pose of a
// weightless object that sits exactly on the instantaneous wave surface (a "feather").
// A real boat is heavy, so it does not follow every ripple. Here the hull is attached to
// that target pose with two damped springs:
//
//   heave  the height above the sea, a spring with a period of ~2 s
//   tilt   the hull's "up" vector (roll and pitch together), a slower spring with a little
//          overshoot, so the boat rocks before it settles
//
// Springs are low-pass filters: ripples shorter than about a second are ignored, the long
// swell lifts and rolls the boat. On top of the target we add what a hull does by itself:
// it leans outwards in a turn and the bow lifts / the stern squats when it accelerates.
// Writes the filtered pose into `out` (position, quaternion, normal).
export function applyBoatWeight(dynamics, target, state, delta, out) {
  const { dir } = state
  const targetHeight = target.position.length() - R

  forward.copy(state.heading).addScaledVector(dir, -state.heading.dot(dir)).normalize()
  right.crossVectors(forward, dir) // starboard

  // Lean outwards in a turn (turning to port, yawRate > 0, leans to starboard) and trim by acceleration.
  const lean = clamp(state.speed * state.yawRate * W.leanFactor, -W.maxLean, W.maxLean)
  const speedFraction = clamp(state.speed / BOAT.maxSpeed, -1, 1)
  const trim = clamp(state.accel * W.pitchFromAccel + speedFraction * W.bowTrim, -W.maxPitch, W.maxPitch)
  targetUp.copy(target.normal).addScaledVector(right, lean).addScaledVector(forward, -trim).normalize()

  if (!dynamics.ready) {
    dynamics.ready = true
    dynamics.height = targetHeight
    dynamics.up.copy(targetUp)
  }

  // Integrate the two springs in small steps so a long frame cannot make them unstable.
  const steps = Math.max(1, Math.ceil(delta * 120))
  const h = delta / steps
  const [wh, zh, wt, zt] = [W.heaveFreq, W.heaveDamping, W.tiltFreq, W.tiltDamping]
  for (let i = 0; i < steps; i++) {
    const heave = wh * wh * (targetHeight - dynamics.height) - 2 * zh * wh * dynamics.heightVelocity
    dynamics.heightVelocity += heave * h
    dynamics.height += dynamics.heightVelocity * h

    acceleration.copy(targetUp).sub(dynamics.up).multiplyScalar(wt * wt).addScaledVector(dynamics.upVelocity, -2 * zt * wt)
    dynamics.upVelocity.addScaledVector(acceleration, h)
    dynamics.up.addScaledVector(dynamics.upVelocity, h)
  }
  dynamics.up.normalize()
  dynamics.upVelocity.addScaledVector(dynamics.up, -dynamics.upVelocity.dot(dynamics.up)) // it can only turn, not stretch

  // Pose from the filtered values.
  out.position.copy(dir).multiplyScalar(R + dynamics.height)
  out.normal.copy(dynamics.up)
  forward.addScaledVector(dynamics.up, -forward.dot(dynamics.up)).normalize()
  right.crossVectors(forward, dynamics.up)
  back.copy(forward).negate() // the model's bow points along local -Z
  basis.makeBasis(right, dynamics.up, back)
  out.quaternion.setFromRotationMatrix(basis)
  return out
}
