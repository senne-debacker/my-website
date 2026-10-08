import { Vector3, Quaternion } from 'three/webgpu'
import { PLANET, BOAT } from '../config.js'

const R = PLANET.radius
const forward = new Vector3()
const port = new Vector3()
const axis = new Vector3()
const rotation = new Quaternion()

// Advances the boat by `delta` seconds. `input` is { throttle, steer, anchored }:
// throttle and steer in [-1, 1] (steer +1 = starboard), already smoothed by interaction.js.
// `time` only drives the anchor sway.
//
// The boat is a small rigid body sliding over the sea (on the sphere's tangent plane):
//   * the engine pulls the velocity along the hull towards the throttle target (slowly: it is heavy)
//   * the keel resists sideways velocity, but not instantly, so the boat drifts a little in turns
//   * the helm sets a target turn rate which the boat follows with inertia: the turn builds up
//     gradually and carries on for a moment after the wheel is released
//   * the hull turns but the velocity does not, so after a turn part of the velocity is
//     "sideways" until the keel kills it: that is the drift
//   * motion follows great circles; heading and velocity are carried along (parallel transport)
// Collisions are handled afterwards by physics/collision.js.
export function stepBoat(state, input, delta, time) {
  const { dir, heading, vel } = state

  // Frame at the boat: forward along the hull, port to the left of it.
  forward.copy(heading).addScaledVector(dir, -heading.dot(dir)).normalize()
  port.crossVectors(dir, forward) // up x forward = to port

  // --- Engine (along the hull) and keel (across it), in the current hull frame ----------------
  let along = vel.dot(forward)
  let across = vel.dot(port)

  const target = input.anchored ? 0 : input.throttle * (input.throttle > 0 ? BOAT.maxSpeed : BOAT.maxReverseSpeed)
  const rate = input.anchored ? BOAT.anchorBrake : input.throttle !== 0 ? BOAT.acceleration : BOAT.drag
  along += (target - along) * (1 - Math.exp(-rate * delta))
  if (target === 0 && Math.abs(along) < 1e-3) along = 0
  across *= Math.exp(-(input.anchored ? BOAT.anchorGrip : BOAT.keelGrip) * delta)

  vel.copy(forward).multiplyScalar(along).addScaledVector(port, across)

  // --- Turning, with inertia -----------------------------------------------------------------------
  // A boat needs way on to turn: full authority from 40% of top speed.
  const authority = Math.min(1, Math.abs(along) / (BOAT.maxSpeed * 0.4))
  let targetYawRate = -input.steer * BOAT.turnRate * authority
  if (input.anchored) targetYawRate += BOAT.anchorSway * Math.cos(time * BOAT.anchorSwayRate)
  state.yawRate += (targetYawRate - state.yawRate) * (1 - Math.exp(-BOAT.yawResponse * delta))

  // Turn the hull (positive = to port). `vel` stays as it is.
  const yaw = state.yawRate * delta
  heading.copy(forward).multiplyScalar(Math.cos(yaw)).addScaledVector(port, Math.sin(yaw)).normalize()

  // --- Move along the great circle in the direction of the velocity --------------------------------
  const overWater = vel.length()
  if (overWater > 1e-6) {
    axis.crossVectors(dir, vel).normalize()
    rotation.setFromAxisAngle(axis, (overWater * delta) / R)
    dir.applyQuaternion(rotation).normalize()
    heading.applyQuaternion(rotation)
    vel.applyQuaternion(rotation)
  }
  // Numerical hygiene: keep heading and velocity exactly in the tangent plane.
  heading.addScaledVector(dir, -heading.dot(dir)).normalize()
  vel.addScaledVector(dir, -vel.dot(dir))

  // Derived values for the HUD, the wake, the sound and the hull's pitch.
  const speed = vel.dot(heading)
  const accel = (speed - state.speed) / Math.max(delta, 1e-4)
  state.accel += (accel - state.accel) * (1 - Math.exp(-6 * delta)) // smoothed
  state.speed = speed
  return state
}
