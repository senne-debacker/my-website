// Checks of the boat physics, run with `npm run check`. No browser needed: the physics
// modules only use three.js maths. Exits with an error if a check fails.
//
//   1. motion      the boat is a rigid body on a sphere: it stays on it, accelerates gradually,
//                  drifts a little in a turn, keeps turning after the helm is released
//   2. collisions  fired at every island and rock from random directions at speed: it never sinks
//                  into the real coastline, and no frame moves it further than its velocity explains
//   3. weight      the hull's springs calm the wave motion compared with a weightless "feather"

import { Vector3 } from 'three/webgpu'
import { createLayout } from '../src/world/layout.js'
import { resolveCollisions } from '../src/physics/collision.js'
import { createBoatState, createBoatPose, computeBoatPose } from '../src/physics/boat.js'
import { stepBoat } from '../src/physics/boatMotion.js'
import { createBoatDynamics, applyBoatWeight } from '../src/physics/boatDynamics.js'
import { PLANET, BOAT } from '../src/config.js'

const R = PLANET.radius
const dt = 1 / 60
let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}
const arc = (a, b) => Math.acos(Math.min(1, a.dot(b))) * R
const start = () => createBoatState(new Vector3(0, 0, 1), new Vector3(1, 0, 0))

// ---- 1. motion -------------------------------------------------------------------------------------
{
  const boat = start()
  let t90 = null
  for (let t = 0; t < 30; t += dt) {
    stepBoat(boat, { throttle: 1, steer: 0, anchored: false }, dt, t)
    if (t90 === null && boat.speed > 0.9 * BOAT.maxSpeed) t90 = t
  }
  check('reaches top speed', Math.abs(boat.speed - BOAT.maxSpeed) < 0.02, `${boat.speed.toFixed(2)} of ${BOAT.maxSpeed}`)
  check('accelerates gradually (heavy hull)', t90 > 2.5 && t90 < 8, `${t90.toFixed(1)} s to 90%`)

  const turning = start()
  turning.vel.copy(turning.heading).multiplyScalar(BOAT.maxSpeed)
  let drift = 0
  for (let t = 0; t < 6; t += dt) {
    stepBoat(turning, { throttle: 1, steer: 1, anchored: false }, dt, t)
    drift = Math.max(drift, (Math.acos(Math.min(1, turning.vel.clone().normalize().dot(turning.heading))) * 180) / Math.PI)
  }
  check('turns to starboard on D', turning.yawRate < -1)
  check('drifts sideways a little in a turn', drift > 3 && drift < 25, `${drift.toFixed(1)} degrees`)
  const before = turning.yawRate
  for (let k = 0; k < 20; k++) stepBoat(turning, { throttle: 1, steer: 0, anchored: false }, dt, 0)
  check('keeps turning after the helm is released', Math.abs(turning.yawRate) > 0.3 * Math.abs(before), `${turning.yawRate.toFixed(2)} of ${before.toFixed(2)} rad/s`)

  const stopped = start()
  stopped.vel.copy(stopped.heading).multiplyScalar(BOAT.maxSpeed)
  for (let t = 0; t < 12; t += dt) stepBoat(stopped, { throttle: 1, steer: 0, anchored: true }, dt, t)
  check('the anchor stops the boat', stopped.vel.length() < 1e-3)

  const long = createBoatState(new Vector3(0, 0.3, 0.954), new Vector3(1, 0, 0))
  let worst = 0
  for (let i = 0; i < 60 * 600; i++) {
    const t = i * dt
    stepBoat(long, { throttle: Math.sin(t * 0.07) > -0.5 ? 1 : -1, steer: Math.sin(t * 0.31), anchored: Math.sin(t * 0.013) > 0.8 }, dt, t)
    worst = Math.max(worst, Math.abs(long.dir.length() - 1), Math.abs(long.heading.length() - 1), Math.abs(long.heading.dot(long.dir)), Math.abs(long.vel.dot(long.dir)))
  }
  check('stays exactly on the sphere for 10 simulated minutes', worst < 1e-9, worst.toExponential(1))
}

// ---- 2. collisions ---------------------------------------------------------------------------------------
{
  const layout = createLayout()
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const limitAt = (collider, dir) => {
    const cos = Math.min(1, dir.dot(collider.dir))
    if (collider.kind !== 'island') return collider.radius
    const b = dir.clone().addScaledVector(collider.dir, -cos).normalize()
    return collider.shape.shorelineAt(Math.atan2(b.dot(collider.shape.t2), b.dot(collider.shape.t1))) + BOAT.shoreMargin
  }
  let frames = 0, hits = 0, kept = 0, deepest = 0, jump = 0, bad = 0, yawKick = 0

  for (const c of layout.colliders) {
    for (let k = 0; k < 40; k++) {
      const bearing = rnd() * Math.PI * 2
      const east = new Vector3().crossVectors(new Vector3(0, 1, 0), c.dir).normalize()
      const north = new Vector3().crossVectors(c.dir, east)
      const outward = east.clone().multiplyScalar(Math.cos(bearing)).addScaledVector(north, Math.sin(bearing))
      const away = (c.reach + 1.2) / R
      const from = c.dir.clone().multiplyScalar(Math.cos(away)).addScaledVector(outward, Math.sin(away)).normalize()
      // (skip starts that are already on land because another obstacle is close)
      if (layout.colliders.some((o) => arc(from, o.dir) < limitAt(o, from))) continue

      const towards = c.dir.clone().addScaledVector(from, -c.dir.dot(from)).normalize()
      const side = new Vector3().crossVectors(from, towards)
      const angle = (rnd() - 0.5) * 1.6
      const boat = createBoatState(from, towards.multiplyScalar(Math.cos(angle)).addScaledVector(side, Math.sin(angle)))
      boat.vel.copy(boat.heading).multiplyScalar(BOAT.maxSpeed * (0.4 + 0.6 * rnd()))

      let hit = false
      const previous = boat.dir.clone()
      for (let t = 0; t < 10; t += dt) {
        stepBoat(boat, { throttle: 1, steer: 0, anchored: false }, dt, t)
        const yawBefore = boat.yawRate
        if (resolveCollisions(boat, layout.colliders, dt) > 0) {
          hit = true
          yawKick = Math.max(yawKick, Math.abs(boat.yawRate - yawBefore))
        }
        jump = Math.max(jump, arc(previous, boat.dir) - boat.vel.length() * dt)
        previous.copy(boat.dir)
        for (const o of layout.colliders) deepest = Math.max(deepest, limitAt(o, boat.dir) - arc(boat.dir, o.dir))
        if (!Number.isFinite(boat.dir.x + boat.vel.x + boat.yawRate)) bad++
        frames++
      }
      if (hit) {
        hits++
        if (boat.vel.length() > 0.15) kept++
      }
    }
  }
  check('collisions: no numerical trouble', bad === 0, `${frames} frames simulated`)
  check('collisions: never sinks into the shoreline', deepest < 0.05, `deepest ${deepest.toFixed(3)} units`)
  check('collisions: no teleporting', jump < 0.03, `largest jump beyond the velocity ${jump.toFixed(4)} units/frame`)
  check('collisions: many hits happened', hits > 200, `${hits} runs hit something`)
  check('collisions: a glancing hit slides on', kept > 0.5 * hits, `${kept} of ${hits} kept moving`)
  check('collisions: impacts turn the hull, but not wildly', yawKick > 0.1 && yawKick < 2, `biggest kick ${yawKick.toFixed(2)} rad/s`)
}

// ---- 3. weight ---------------------------------------------------------------------------------------------
for (const storm of [0.3, 1]) {
  const boat = createBoatState(new Vector3(0, 0.3, 0.954), new Vector3(1, 0, 0))
  boat.vel.copy(boat.heading).multiplyScalar(1.7)
  const target = createBoatPose()
  const shown = createBoatPose()
  const dynamics = createBoatDynamics()
  const heights = { target: [], shown: [] }
  let tiltTarget = 0, tiltShown = 0, lag = 0, maxLag = 0
  let previousTarget = null, previousShown = null
  for (let i = 0; i < 60 * 60; i++) {
    const t = i * dt
    stepBoat(boat, { throttle: 1, steer: Math.sin(t * 0.25) * 0.6, anchored: false }, dt, t)
    computeBoatPose(boat, t, storm, target)
    applyBoatWeight(dynamics, target, boat, dt, shown)
    heights.target.push(target.position.length() - R)
    heights.shown.push(shown.position.length() - R)
    if (previousTarget) {
      tiltTarget += (Math.acos(Math.min(1, target.normal.dot(previousTarget))) / dt) ** 2
      tiltShown += (Math.acos(Math.min(1, shown.normal.dot(previousShown))) / dt) ** 2
    }
    previousTarget = target.normal.clone()
    previousShown = shown.normal.clone()
    const gap = Math.abs(heights.shown.at(-1) - heights.target.at(-1))
    lag += gap
    maxLag = Math.max(maxLag, gap)
  }
  const accelerationRms = (h) => Math.sqrt(h.slice(2).reduce((sum, _, i) => sum + ((h[i + 2] - 2 * h[i + 1] + h[i]) / (dt * dt)) ** 2, 0) / (h.length - 2))
  const [aTarget, aShown] = [accelerationRms(heights.target), accelerationRms(heights.shown)]
  check(`weight (storm ${storm}): much calmer up and down`, aShown < aTarget / 4, `acceleration ${aTarget.toFixed(2)} -> ${aShown.toFixed(2)}`)
  check(`weight (storm ${storm}): calmer roll and pitch`, tiltShown < tiltTarget / 1.8, `tilt speed ${Math.sqrt(tiltTarget / 3600).toFixed(2)} -> ${Math.sqrt(tiltShown / 3600).toFixed(2)} rad/s`)
  check(`weight (storm ${storm}): still rides the water`, maxLag < 0.3 && lag / 3600 < 0.08, `mean lag ${(lag / 3600).toFixed(3)}, max ${maxLag.toFixed(3)} units`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
