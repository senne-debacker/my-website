// Checks of the boat physics, run with `npm run check`. No browser needed: the physics
// modules only use three.js maths. Exits with an error if a check fails.
//
//   1. motion      the boat is a rigid body on a sphere: it stays on it, accelerates gradually,
//                  drifts a little in a turn, keeps turning after the helm is released
//   2. collisions  fired at every island and rock from random directions at speed: it never sinks
//                  into the real coastline, and no frame moves it further than its velocity explains
//   3. weight      the hull's springs calm the wave motion compared with a weightless "feather"

import { Vector3, Matrix4 } from 'three/webgpu'
import { createLayout } from '../src/world/layout.js'
import { resolveCollisions } from '../src/physics/collision.js'
import { createBoatState, createBoatPose, computeBoatPose } from '../src/physics/boat.js'
import { stepBoat } from '../src/physics/boatMotion.js'
import { createBoatDynamics, applyBoatWeight } from '../src/physics/boatDynamics.js'
import { PLANET, BOAT, WORLD } from '../src/config.js'
import { sampleHeight } from '../src/physics/waves.js'
import { Scene, DirectionalLight, HemisphereLight } from 'three/webgpu'
import { createBuoys } from '../src/scene/buoys.js'
import { createAtmosphere, sunDirection } from '../src/world/atmosphere.js'

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

  const boosted = start()
  for (let t = 0; t < 30; t += dt) stepBoat(boosted, { throttle: 1, steer: 0, anchored: false, boost: true }, dt, t)
  check('boost: Shift raises the top speed to 8 knots', Math.abs(boosted.speed * 5 - 8) < 0.1, `${(boosted.speed * 5).toFixed(2)} knots`)
  for (let t = 0; t < 30; t += dt) stepBoat(boosted, { throttle: 1, steer: 0, anchored: false, boost: false }, dt, t)
  check('boost: releasing Shift settles back to 5 knots', Math.abs(boosted.speed * 5 - 5) < 0.1, `${(boosted.speed * 5).toFixed(2)} knots`)
  const noThrottle = start()
  for (let t = 0; t < 10; t += dt) stepBoat(noThrottle, { throttle: 0, steer: 0, anchored: false, boost: true }, dt, t)
  const anchored = start()
  anchored.vel.copy(anchored.heading).multiplyScalar(1)
  for (let t = 0; t < 10; t += dt) stepBoat(anchored, { throttle: 1, steer: 0, anchored: true, boost: true }, dt, t)
  check('boost: does nothing without throttle or with the anchor down', noThrottle.vel.length() < 1e-6 && anchored.vel.length() < 1e-3)

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

// ---- 4. time follows the player ------------------------------------------------------------------------
// The planet is tiny, so a sun fixed in space would put you through sunset just by sailing round it.
// The sun's height above the boat must depend only on the clock, wherever the boat is.
{
  const atmosphere = createAtmosphere({ scene: new Scene(), sun: new DirectionalLight(), moon: new DirectionalLight(), fill: new HemisphereLight() })
  const boat = createBoatState(new Vector3(0, 0.3, 0.954), new Vector3(1, 0, 0))
  const calm = { storm: 0, cover: 0, rain: 0 }
  let worstDrift = 0
  let farthest = 0
  const start = boat.dir.clone()
  let timeOfDay = 0.71
  for (let i = 0; i < 60 * 600; i++) {
    const t = i * dt
    stepBoat(boat, { throttle: 1, steer: Math.sin(t * 0.21) * 0.8, anchored: false }, dt, t)
    timeOfDay = (timeOfDay + dt / 210) % 1
    atmosphere.update(timeOfDay, boat.dir, 3, 0, calm)
    // What the sun's height at the start of the game would be at this time:
    const expected = sunDirection(timeOfDay, new Vector3()).dot(start)
    worstDrift = Math.max(worstDrift, Math.abs(atmosphere.state.elevation - expected))
    farthest = Math.max(farthest, arc(start, boat.dir))
  }
  check('time follows the player: sun height depends only on the clock', worstDrift < 1e-3, `worst difference ${worstDrift.toExponential(1)} after sailing up to ${farthest.toFixed(1)} units from the start`)
  check('time follows the player: the boat really went round the planet', farthest > 0.7 * Math.PI * R, `${(farthest / R).toFixed(2)} radians from the start`)
}

// ---- 4b. the day's schedule ---------------------------------------------------------------------------
// Twilight from 18:00, night from 20:00, morning twilight from 04:00, full day from 06:00 (DAY.hours).
{
  const atmosphere = createAtmosphere({ scene: new Scene(), sun: new DirectionalLight(), moon: new DirectionalLight(), fill: new HemisphereLight() })
  const up = new Vector3(0, 0.3, 0.954).normalize()
  const calm = { storm: 0, cover: 0, rain: 0 }
  const at = (hour) => {
    atmosphere.update(hour / 24, up, 3, 0, calm)
    return { stars: atmosphere.state.stars, sun: atmosphere.state.sunIntensity, elevation: atmosphere.state.elevation }
  }
  const [h18, h1830, h19, h20, h21] = [at(18), at(18.5), at(19), at(20), at(21)]
  const [h4, h5, h6] = [at(4), at(5), at(6)]
  const noon = at(12)
  check('schedule: full daylight until 18:00', h18.stars === 0 && Math.abs(h18.sun - noon.sun) < 0.05 * noon.sun, `sun ${h18.sun.toFixed(2)} vs ${noon.sun.toFixed(2)} at noon`)
  check('schedule: evening twilight between 18:00 and 20:00', h1830.sun < 0.95 * h18.sun && h19.sun < h1830.sun && h19.stars < 1 && h20.sun < 0.1)
  check('schedule: full night from 20:00 to 04:00', h20.stars === 1 && h21.stars === 1 && h4.stars === 1 && h20.sun === 0 && h4.sun === 0)
  check('schedule: morning twilight between 04:00 and 06:00, full day at 06:00', h5.stars < 1 && h5.sun > 0 && h6.stars === 0 && Math.abs(h6.sun - noon.sun) < 0.05 * noon.sun)
}

// ---- 4c. buoys ------------------------------------------------------------------------------------------
// The boat sails straight through a buoy without slowing; the buoy is pushed over and rights itself.
{
  const ahead = (distance, sideways = 0) => {
    const start = new Vector3(0, 0, 1)
    const forward = new Vector3(1, 0, 0)
    const right = new Vector3().crossVectors(forward, start)
    return start.clone().multiplyScalar(Math.cos(distance / R)).addScaledVector(forward, Math.sin(distance / R)).addScaledVector(right, sideways / R).normalize()
  }
  const sail = ({ speed, sideways = 0, seconds = 14 }) => {
    const group = createBuoys([{ dir: ahead(2, sideways), heading: new Vector3(1, 0, 0) }])
    const buoy = group.buoys[0]
    const boat = createBoatState(new Vector3(0, 0, 1), new Vector3(1, 0, 0))
    let peak = 0, lowestSpeed = Infinity, hits = 0, upright = null
    for (let i = 0; i < seconds * 60; i++) {
      const t = i * dt
      boat.vel.copy(boat.heading).multiplyScalar(speed) // constant throttle: any slowing down would have to come from a buoy
      stepBoat(boat, { throttle: 1, steer: 0, anchored: false }, dt, t)
      if (i === 60) boat.vel.copy(boat.heading).multiplyScalar(speed)
      if (group.update(t, 0, 0, boat, dt) > 0) hits++
      peak = Math.max(peak, buoy.tilt.lean.length())
      if (i > 120) lowestSpeed = Math.min(lowestSpeed, boat.vel.length())
      if (peak > 0.2 && upright === null && buoy.tilt.lean.length() < 0.03 && buoy.tilt.vel.length() < 0.1) upright = t
    }
    return { peak, lowestSpeed, hits, upright, finalLean: buoy.tilt.lean.length() }
  }
  const fast = sail({ speed: BOAT.maxSpeed })
  const slow = sail({ speed: 0.25 })
  const miss = sail({ speed: BOAT.maxSpeed, sideways: 1 })
  check('buoy: hit at speed it is pushed well over', fast.peak > 0.7 && fast.peak < 1.46, `${(fast.peak * 57.3).toFixed(0)} degrees`)
  check('buoy: a gentle touch tips it less', slow.peak > 0.1 && slow.peak < 0.8 * fast.peak, `${(slow.peak * 57.3).toFixed(0)} degrees at a quarter of the speed`)
  check('buoy: it comes back up and stays up', fast.finalLean < 0.02 && fast.upright !== null && fast.upright < 12, `upright again ${fast.upright?.toFixed(1)} s after the start of the run`)
  check('buoy: one hit counts once (one sound)', fast.hits === 1, `${fast.hits} hit(s)`)
  check('buoy: the boat is not slowed down', fast.lowestSpeed > 0.98 * BOAT.maxSpeed, `lowest speed ${fast.lowestSpeed.toFixed(3)} of ${BOAT.maxSpeed}`)
  check('buoy: a near miss does not touch it', miss.peak === 0 && miss.hits === 0, `passed 1 unit to the side`)
}

// ---- 5. the boat does not go under in a storm ----------------------------------------------------------
{
  const corners = [[0.19, -0.45], [-0.19, -0.45], [0.19, 0.45], [-0.19, 0.45], [0, -0.3], [0, 0.4], [0.19, 0], [-0.19, 0]] // x, z of the hull's sides
  const boat = createBoatState(new Vector3(0, 0.3, 0.954), new Vector3(1, 0, 0))
  boat.vel.copy(boat.heading).multiplyScalar(0.9)
  const target = createBoatPose()
  const shown = createBoatPose()
  const dynamics = createBoatDynamics()
  const matrix = new Matrix4()
  let frames = 0, wet = 0, worst = 0
  for (let i = 0; i < 60 * 120; i++) {
    const t = i * dt
    stepBoat(boat, { throttle: Math.sin(t * 0.05) > -0.7 ? 1 : 0, steer: Math.sin(t * 0.3) * 0.6, anchored: false }, dt, t)
    computeBoatPose(boat, t, 1, target)
    applyBoatWeight(dynamics, target, boat, dt, shown)
    matrix.compose(shown.position, shown.quaternion, new Vector3(1, 1, 1))
    let any = false
    for (const [x, z] of corners) {
      const top = new Vector3(x, BOAT.rideHeight + 0.14, z).applyMatrix4(matrix) // top edge of the hull side
      const over = R + sampleHeight(top.clone().normalize(), t, 1) - top.length()
      if (over > 0) {
        any = true
        worst = Math.max(worst, over)
      }
    }
    frames++
    if (any) wet++
  }
  check('storm: only brief spray over the hull sides (full storm)', wet / frames < 0.015 && worst < 0.08, `${(100 * wet / frames).toFixed(2)}% of ${frames} frames, worst ${worst.toFixed(3)} units, rideHeight ${BOAT.rideHeight}`)
}

// ---- 6. the big ocean ------------------------------------------------------------------------------------
{
  const layout = createLayout()
  const { ocean } = layout
  let seed = 5
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  let inside = 0
  const samples = 100000
  for (let i = 0; i < samples; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, ring = Math.sqrt(1 - z * z)
    if (arc(ocean.dir, new Vector3(ring * Math.cos(a), z, ring * Math.sin(a))) < ocean.radius) inside++
  }
  check('ocean: covers the requested share of the planet', Math.abs(inside / samples - WORLD.ocean.fraction) < 0.01, `${(100 * inside / samples).toFixed(1)}% of the surface`)
  const touching = [
    ...layout.islands.filter((i) => arc(ocean.dir, i.dir) < ocean.radius + i.radius * 1.4),
    ...layout.rocks.filter((r) => arc(ocean.dir, r.dir) < ocean.radius + r.radius),
    ...layout.buoys.filter((b) => arc(ocean.dir, b.dir) < ocean.radius + 0.3),
  ]
  check('ocean: no island, rock or buoy in it', touching.length === 0, `${layout.islands.length} islands, ${layout.rocks.length} rocks, ${layout.buoys.length} buoys left in the rest of the world`)
  check('ocean: the start and the landmarks are outside it', arc(ocean.dir, layout.start.dir) > ocean.radius && ['lighthouse', 'pines', 'autumn'].every((n) => layout.islands.some((i) => i.name === n)))

  // The rest of the world must be exactly what it was without an ocean.
  const saved = WORLD.ocean.fraction
  WORLD.ocean.fraction = 0
  const without = createLayout()
  WORLD.ocean.fraction = saved
  const id = (list) => new Set(list.map((x) => [x.dir.x, x.dir.y, x.dir.z].map((v) => v.toFixed(6)).join()))
  const same = (a, b) => [...id(b)].every((k) => id(a).has(k))
  check('ocean: everything outside it is unchanged', same(without.islands, layout.islands) && same(without.rocks, layout.rocks) && same(without.buoys, layout.buoys), `${without.islands.length - layout.islands.length} islands and ${without.rocks.length - layout.rocks.length} rocks left out`)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed')
process.exit(failures ? 1 : 0)
