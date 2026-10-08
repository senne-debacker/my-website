import { Vector3, Quaternion } from 'three/webgpu'
import { PLANET, BOAT } from '../config.js'

const R = PLANET.radius
const away = new Vector3() // unit tangent at the boat pointing away from the obstacle's centre
const bearingDir = new Vector3()
const normal = new Vector3()
const forward = new Vector3()
const port = new Vector3()
const contactPoint = new Vector3()
const lever = new Vector3()
const push = new Vector3()
const axis = new Vector3()
const rotation = new Quaternion()

// Hull half-sizes, used to find which part of the hull touches the shore.
const HALF_LENGTH = 0.45
const HALF_BEAM = 0.19

// Keeps the boat out of islands and rocks and reacts like a boat hitting a shore.
//
// Colliders (see world/layout.js):
//   { kind: 'island', dir, shape, reach }   the real coastline: shape.shorelineAt(bearing)
//   { kind: 'circle', dir, radius, reach }  a rock
// The boat counts as touching when its centre is closer to the centre of the obstacle than the
// shoreline at that bearing plus BOAT.shoreMargin.
//
// Response, in the tangent plane, with n = the shore's outward normal:
//   1. the velocity into the shore is removed and a fraction BOAT.restitution of it comes back
//      (a small bounce), the rest is lost
//   2. friction takes some of the sliding velocity away, in proportion to how hard it hit
//   3. the hull is spun by the impact: the point that touched is pushed back, so a glancing hit
//      with the bow swings the bow away (physics of a torque about the centre)
//   4. the overlap is corrected softly (a fraction per frame, capped), so the boat is eased out
//      instead of being teleported to the rim
// Returns the strongest impact (0..1), for the sound and the HUD.
export function resolveCollisions(state, colliders, delta) {
  const { dir, vel, heading } = state
  let strongest = 0

  for (const collider of colliders) {
    const cosAngle = Math.min(1, Math.max(-1, dir.dot(collider.dir)))
    const distance = Math.acos(cosAngle) * R
    if (distance > collider.reach) continue

    // Direction from the obstacle's centre to the boat, as a tangent vector at the boat.
    away.copy(dir).addScaledVector(collider.dir, -cosAngle)
    if (away.lengthSq() < 1e-12) away.copy(heading) // exactly at the centre: any direction will do
    away.addScaledVector(dir, -away.dot(dir)).normalize()
    // ... and the same direction as a vector at the obstacle's centre (to get the bearing).
    bearingDir.copy(dir).addScaledVector(collider.dir, -cosAngle).normalize()

    let limit // how far from the obstacle's centre the boat may be
    normal.copy(away)
    if (collider.kind === 'island') {
      const { shape } = collider
      const theta = Math.atan2(bearingDir.dot(shape.t2), bearingDir.dot(shape.t1))
      limit = shape.shorelineAt(theta) + BOAT.shoreMargin
      // The shoreline is not a circle: tilt the normal by the contour's slope.
      const slope = Math.max(-0.8, Math.min(0.8, shape.shorelineSlope(theta) / Math.max(limit, 0.1))) // at most ~40 degrees of tilt
      port.crossVectors(dir, away) // direction of increasing bearing (counter-clockwise from outside)
      normal.addScaledVector(port, -slope).normalize()
    } else {
      limit = collider.radius
    }

    const penetration = limit - distance
    if (penetration <= 0) continue

    // --- Velocity response ------------------------------------------------------------------------
    const into = vel.dot(normal) // negative = moving into the shore
    if (into < 0) {
      const change = -(1 + BOAT.restitution) * into // impulse per unit mass, along the normal
      vel.addScaledVector(normal, change)

      // Friction against the sliding part of the velocity.
      push.copy(vel).addScaledVector(normal, -vel.dot(normal))
      const sliding = push.length()
      if (sliding > 1e-6) vel.addScaledVector(push, -Math.min(1, (BOAT.shoreFriction * change) / sliding))

      // Torque from the hull point that touched: the ellipse's support point towards the shore.
      forward.copy(heading).addScaledVector(dir, -heading.dot(dir)).normalize()
      port.crossVectors(dir, forward)
      const df = -normal.dot(forward)
      const dp = -normal.dot(port)
      const norm = Math.hypot(HALF_LENGTH * df, HALF_BEAM * dp) || 1
      lever.copy(forward).multiplyScalar((HALF_LENGTH * HALF_LENGTH * df) / norm)
        .addScaledVector(port, (HALF_BEAM * HALF_BEAM * dp) / norm)
      contactPoint.crossVectors(lever, normal) // r x n; its component along "up" is the torque per unit impulse
      state.yawRate += (dir.dot(contactPoint) * change) / BOAT.hullInertia

      strongest = Math.max(strongest, Math.min(1, change / (BOAT.maxSpeed * (1 + BOAT.restitution))))
    }

    // --- Soft position correction (never a jump) -------------------------------------------------
    // Pushed straight away from the obstacle's centre: that always reduces the overlap, even where
    // the coast is ragged and its normal leans sideways.
    const correction = Math.min(penetration * (1 - Math.exp(-BOAT.pushOut * delta)), BOAT.maxPushOut)
    axis.crossVectors(dir, away).normalize()
    rotation.setFromAxisAngle(axis, correction / R) // moves the boat along `away`
    dir.applyQuaternion(rotation).normalize()
    heading.applyQuaternion(rotation)
    vel.applyQuaternion(rotation)
  }

  if (strongest > 0) {
    heading.addScaledVector(dir, -heading.dot(dir)).normalize()
    vel.addScaledVector(dir, -vel.dot(dir))
    state.speed = vel.dot(heading)
  }
  return strongest
}
