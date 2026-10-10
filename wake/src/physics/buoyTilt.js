import { Vector3 } from 'three/webgpu'
import { PLANET } from '../config.js'

const R = PLANET.radius

// A buoy is moored: it stays where it is, but the boat can push it over. Its tilt is a small
// spring: when the hull touches it, it gets a kick in the direction it is pushed, tips over, and
// the buoyancy (a righting spring with some damping) brings it back upright with a few wobbles.
// The boat is not affected at all: it sails straight through.
export const BUOY = {
  radius: 0.11, // of the buoy's body
  stiffness: 15, // 1 / s^2, how hard it rights itself (natural period about 1.6 s)
  damping: 1.6, // 1 / s, so it wobbles a few times before it settles
  impulse: 4.4, // rad / s of kick per unit of boat speed
  minImpulse: 1.1, // rad / s, even a gentle touch tips it a little
  push: 7, // rad / s^2, the push while the hull stays against it
  maxTilt: 1.45, // radians (83 degrees): it never goes fully under
}

// Hull half sizes, as in physics/collision.js.
const HALF_LENGTH = 0.45
const HALF_BEAM = 0.19

export function createBuoyTilt() {
  // lean: a tangent vector at the buoy, pointing the way it leans; its length is the angle (radians)
  return { lean: new Vector3(), vel: new Vector3(), touching: false, peak: 0 }
}

const offset = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const direction = new Vector3()
const travel = new Vector3()
const acceleration = new Vector3()

// Does the boat's hull (an ellipse on the water) touch the buoy at `buoyDir`? Returns null, or
// { push, speed }: the unit direction the buoy is pushed (tangent at the buoy: part away from the
// hull, part the way the boat is travelling) and how fast the boat is moving along it.
export function hullTouchesBuoy(buoyDir, boat) {
  const { dir, heading, vel } = boat
  offset.copy(buoyDir).addScaledVector(dir, -buoyDir.dot(dir)) // buoy relative to the boat, in the boat's tangent plane
  if (offset.lengthSq() * R * R > 1.6) return null // far away: skip the maths
  forward.copy(heading).addScaledVector(dir, -heading.dot(dir)).normalize()
  right.crossVectors(forward, dir)
  const f = offset.dot(forward) * R
  const s = offset.dot(right) * R
  const [a, b] = [HALF_LENGTH + BUOY.radius, HALF_BEAM + BUOY.radius]
  if ((f / a) ** 2 + (s / b) ** 2 >= 1) return null

  direction.copy(offset).addScaledVector(buoyDir, -offset.dot(buoyDir)).normalize() // away from the boat's centre
  const speed = vel.length()
  if (speed > 0.05) {
    travel.copy(vel).addScaledVector(buoyDir, -vel.dot(buoyDir)).normalize()
    direction.multiplyScalar(0.5).addScaledVector(travel, 0.5 * Math.min(1, speed / 0.5)).normalize() // mostly the way the boat is going
  }
  return { push: direction, speed: Math.max(0, vel.dot(direction)) }
}

// Advances one buoy's tilt by `delta` seconds. `hit` is the result of hullTouchesBuoy (or null).
// Returns how hard it was just hit (0..1) on the frame the hull first touches it, otherwise 0.
export function stepBuoyTilt(tilt, delta, hit) {
  let strength = 0
  if (hit && !tilt.touching) {
    tilt.vel.addScaledVector(hit.push, BUOY.minImpulse + BUOY.impulse * hit.speed)
    strength = Math.min(1, 0.25 + hit.speed)
  }
  tilt.touching = hit !== null

  const steps = Math.max(1, Math.ceil(delta * 120))
  const h = delta / steps
  for (let i = 0; i < steps; i++) {
    acceleration.copy(tilt.lean).multiplyScalar(-BUOY.stiffness).addScaledVector(tilt.vel, -BUOY.damping)
    if (hit) acceleration.addScaledVector(hit.push, BUOY.push) // the hull keeps leaning on it
    tilt.vel.addScaledVector(acceleration, h)
    tilt.lean.addScaledVector(tilt.vel, h)
    const angle = tilt.lean.length()
    if (angle > BUOY.maxTilt) {
      tilt.lean.multiplyScalar(BUOY.maxTilt / angle)
      const outward = tilt.vel.dot(tilt.lean) / (BUOY.maxTilt * BUOY.maxTilt) // part of the velocity still tipping it further
      if (outward > 0) tilt.vel.addScaledVector(tilt.lean, -outward)
    }
  }
  tilt.peak = Math.max(tilt.peak, tilt.lean.length())
  return strength
}
