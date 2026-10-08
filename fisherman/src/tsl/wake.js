import { Fn, Loop, float, length, exp, step } from 'three/tsl'
import { PLANET, WAKE } from '../config.js'
import { uniforms } from '../uniforms.js'

// Foam amount caused by the boat at a point `dir` on the unit sphere (roughly 0..1, may
// exceed 1 where the layers overlap). It has three layers:
//
//   ARMS   an expanding Gaussian ring around every remembered stern position:
//            radius = age * WAKE.spread, width = WAKE.width + age * WAKE.widthGrowth,
//            strength = speed then * exp(-age * WAKE.decay)
//          The rings of a moving source pile up into a V behind the boat (the Kelvin wake).
//   WASH   a Gaussian blob at the remembered positions themselves: a continuous churned strip
//          right behind the stern that outlasts the arms.
//   BOW    a blob just ahead of the boat where the hull pushes the water aside.
//
// This runs per vertex (see waterMaterial.js); the fragment stage then breaks the smooth value
// up with noise to get the lacy foam edge.
export const wakeFoam = Fn(([dir]) => {
  const arms = float(0).toVar()
  const wash = float(0).toVar()

  Loop(WAKE.points, ({ i }) => {
    const entry = uniforms.wakeTrail.element(i) // xyz = direction, w = strength
    const index = float(i)
    // Entry 0 is "now"; entry n >= 1 is (n - 1) intervals older than the last snapshot.
    const age = index.sub(1).max(0).mul(WAKE.interval).add(uniforms.wakeSince.mul(step(float(0.5), index)))
    const distance = length(dir.sub(entry.xyz)).mul(PLANET.radius) // chord ~ arc for small angles

    const width = age.mul(WAKE.widthGrowth).add(WAKE.width)
    const offset = distance.sub(age.mul(WAKE.spread))
    const ring = exp(offset.mul(offset).negate().div(width.mul(width).mul(2)))
    arms.addAssign(ring.mul(exp(age.mul(-WAKE.decay))).mul(entry.w))

    const sigma = age.mul(WAKE.washGrowth).add(WAKE.washWidth)
    const blob = exp(distance.mul(distance).negate().div(sigma.mul(sigma).mul(2)))
    wash.addAssign(blob.mul(exp(age.mul(-WAKE.washDecay))).mul(entry.w))
  })

  const bow = uniforms.wakeBow // xyz = direction, w = strength
  const bowDistance = length(dir.sub(bow.xyz)).mul(PLANET.radius)
  const bowFoam = exp(bowDistance.mul(bowDistance).negate().div(2 * WAKE.bowRadius * WAKE.bowRadius)).mul(bow.w)

  return arms.mul(WAKE.strength).add(wash.mul(WAKE.washStrength)).add(bowFoam.mul(WAKE.bowStrength)).min(1.5)
})
