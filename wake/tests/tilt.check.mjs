// Checks of the tilt steering maths (src/tilt.js), run with `npm run check`. No browser needed.
//   - gravity seen from the screen gives the same angle in portrait and in landscape (both ways)
//   - turning the phone clockwise steers to starboard (+), anticlockwise to port (-)
//   - dead zone, full helm, wrap-around, a nearly flat phone reports no usable angle

import { TILT } from '../src/config.js'
import { screenRoll, steerFromRoll } from '../src/tilt.js'

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e
const RAD = Math.PI / 180

// A phone leaned back by 30 degrees (screen towards the player, a little up) and turned `wheel`
// degrees clockwise, as seen by the player, like a steering wheel. Rotating the device about its own
// z axis (out of the screen) turns the direction of gravity in the device frame the other way, so we
// build "up" in device coordinates, then convert it to deviceorientation angles (beta, gamma) the
// way the sensor reports them (the inverse of the formula in screenRoll).
const lean = 30 * RAD
const eulerFromUp = ([ux, uy, uz]) => [Math.asin(uy) / RAD, Math.atan2(-ux, uz) / RAD]
const rotateZ = ([x, y, z], angle) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z]
const held = (up0, screenAngle) => (wheel) => {
  const [beta, gamma] = eulerFromUp(rotateZ(up0, wheel * RAD)) // clockwise by w = anticlockwise by -w; rotating "up" by +w in the device frame
  return screenRoll(beta, gamma, screenAngle)
}
const portrait = held([0, Math.cos(lean), Math.sin(lean)], 0) // natural orientation
const landscapeLeft = held([Math.cos(lean), 0, Math.sin(lean)], 90) // top edge to the left: screen up = device +x
const landscapeRight = held([-Math.cos(lean), 0, Math.sin(lean)], 270) // top edge to the right: screen up = device -x

for (const [name, fn] of [['portrait', portrait], ['landscape (top left)', landscapeLeft], ['landscape (top right)', landscapeRight]]) {
  const upright = fn(0)
  check(`${name}: held upright is roll 0`, near(upright.roll, 0, 1e-6) && upright.strength > TILT.minGravity, `roll ${upright.roll.toFixed(3)}, gravity in plane ${upright.strength.toFixed(2)}`)
  const turned = fn(20)
  check(`${name}: a clockwise turn of 20 degrees steers to starboard`, steerFromRoll(turned.roll, 0) > 0.5, `helm ${steerFromRoll(turned.roll, 0).toFixed(2)}`)
  const back = fn(-20)
  check(`${name}: an anticlockwise turn steers to port, symmetric`, near(steerFromRoll(back.roll, 0), -steerFromRoll(turned.roll, 0)))
}
check('the same wheel angle gives the same roll in all three orientations', near(portrait(17).roll, landscapeLeft(17).roll, 1e-6) && near(portrait(17).roll, landscapeRight(17).roll, 1e-6),
  [portrait(17), landscapeLeft(17), landscapeRight(17)].map((r) => (r.roll / RAD).toFixed(2)).join(' / '))

const roll = (deg) => deg * RAD
check('inside the dead zone the helm is 0', steerFromRoll(roll(-TILT.deadDeg * 0.9), 0) === 0)
check('at fullDeg the helm is 1, beyond it stays 1', near(steerFromRoll(roll(-TILT.fullDeg), 0), 1) && steerFromRoll(roll(-90), 0) === 1)
check('halfway between dead zone and full is half helm', near(steerFromRoll(roll(-(TILT.deadDeg + TILT.fullDeg) / 2), 0), 0.5))
check('the neutral angle moves the zero point', steerFromRoll(roll(10), roll(10)) === 0 && steerFromRoll(roll(-30), roll(10)) === 1)
check('angles wrap round (-179 versus +179 degrees are 2 apart, not 358)', Math.abs(steerFromRoll(roll(179), roll(-179))) < 0.1)
check('a phone lying flat has almost no gravity in the screen plane', screenRoll(2, 1, 0).strength < TILT.minGravity)
check('a phone held at 45 degrees is still usable', screenRoll(45, 0, 0).strength > TILT.minGravity)

if (failures) {
  console.error(`\n${failures} tilt check(s) failed`)
  process.exit(1)
}
console.log('\nall tilt checks passed')
