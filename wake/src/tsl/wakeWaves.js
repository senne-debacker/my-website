// TSL port of a Shadertoy wake shader (title, author and URL: see "Third-party code" in the
// README; the pasted code states no licence, so Shadertoy's default CC BY-NC-SA 3.0 is assumed). It does not draw a V-shape: it adds up the waves the boat emitted at every point of
// its past path, each one travelling by the deep-water dispersion relation (long waves run
// faster than short ones), and the V (the Kelvin wake) appears by itself where those waves
// reinforce each other.
//
// The original, for reference (a 2D picture: the boat sails along the x axis of the screen, the
// pixel U is measured in the boat's frame):
//
//   for (float x = 0.; x<=5.; x += dx ) {          // sum pulse emitted at each past location
//       vec2 P = U - vec2(x,.2*sin(2.*x-iTime));   // pixel position in past boat frame
//       float l = length(P)*L,
//             k = 6.283/(2.*l),                    // k=2pi/L, energy at l=L/2 since Cg = 1/2 Cphi
//             t = x*L/V,                           // time where boat was at x (approx)
//             a = 3.1416 - sqrt(9.81*k) *t,        // cos(kl-wt), kl=pi, w=sqrt(gk)
//             v = (l-l0)/W;                        // spectrum of wave emission by the boat
//       O +=  cos(a) / l  * exp(-.5*v*v);
//   }
//   O = .5 + .5* O*dx *1.7e3/S;
//
// How it is mapped here (CHANGED marks the differences):
//   * the "past locations" are the remembered stern positions of world/wake.js (`wakeTrail`,
//     a direction on the sphere each, 0.1 s apart); `x` runs over that list instead of a line;
//   * `t`, the time since the boat was at that spot, is simply the entry's age;
//   * `l` is the distance over the sea (chord of the unit-sphere directions x planet radius), in
//     game units instead of metres; `g`, the peak wavelength l0 and its width W are in `WAKE.waves`;
//   * the original's step `dx` (the length of path one sample stands for) becomes the distance
//     the boat covered in one sample interval: speed x time. The trail stores "speed / top
//     speed" in `w`, so a boat that stands still emits nothing;
//   * CHANGED: between two stored positions the position, age and strength are interpolated
//     (`WAKE.waves.substeps` samples per interval), because the waves are shorter than the
//     distance the boat covers in 0.1 s and would alias otherwise;
//   * CHANGED: `l` is kept above `minLength` (1/l blows up right at the path) and the oldest
//     entries fade out, so the field does not end in a hard edge where the trail ends;
//   * the output is the signed sum, as a height, not the picture's `.5 + .5 * sum`.

import { Fn, Loop, If, float, length, cos, exp, sqrt, max, smoothstep, step, positionView } from 'three/tsl'
import { PLANET, WAKE, BOAT } from '../config.js'
import { uniforms } from '../uniforms.js'

const W = WAKE.waves
const PI = 3.1416

// Age of trail entry `index` (as a float): entry 0 is "now", entry n >= 1 is (n - 1) intervals
// older than the last snapshot.
const entryAge = (index) => index.sub(1).max(0).mul(WAKE.interval).add(uniforms.wakeSince.mul(step(float(0.5), index)))

// Height of the boat's wake waves at the point `dir` on the unit sphere (signed, world units).
// Two cheap tests keep the per-pixel cost down: nothing is computed where the result would be
// faded out anyway (far from the camera), and a stored position whose distance is more than the
// emission peak plus 2.7 widths away is skipped (its pulse is below exp(-3.6) there).
export const wakeWaves = Fn(([dir]) => {
  const total = float(0).toVar() // GLSL: O
  const nearest = float(10).toVar() // distance to the closest point of the boat's path
  const near = float(1).sub(smoothstep(float(W.visible[0]), float(W.visible[1]), positionView.length()))
  const reach = (W.peak + 2.7 * W.width + 0.15) / PLANET.radius // in unit-sphere chord length

  If(near.greaterThan(0), () => {
    Loop(WAKE.points - 1, ({ i }) => {
      const older = uniforms.wakeTrail.element(i)
      // a boat that stands still (strength 0) emits nothing; far entries cannot reach this pixel
      If(older.w.greaterThan(0.01).and(length(dir.sub(older.xyz)).lessThan(reach)), () => {
        const newer = uniforms.wakeTrail.element(i.add(1))
        const ageA = entryAge(float(i))
        const ageB = entryAge(float(i).add(1))

        for (let j = 0; j < W.substeps; j++) {
          const s = j / W.substeps
          // the interpolated sample between two stored positions
          const position = older.xyz.add(newer.xyz.sub(older.xyz).mul(s))
          const strength = older.w.add(newer.w.sub(older.w).mul(s))
          const t = ageA.add(ageB.sub(ageA).mul(s)) //            GLSL: t = x*L/V

          const distance = length(dir.sub(position)).mul(PLANET.radius)
          nearest.assign(nearest.min(distance))
          const l = max(distance, float(W.minLength)) //          GLSL: l = length(P)*L
          const k = float(2 * Math.PI).div(l.mul(2)) //            GLSL: k = 6.283/(2.*l)
          const a = float(PI).sub(sqrt(k.mul(W.gravity)).mul(t)) // GLSL: a = 3.1416 - sqrt(9.81*k)*t
          const v = l.sub(W.peak).div(W.width) //                  GLSL: v = (l-l0)/W
          const pulse = cos(a).div(l).mul(exp(v.mul(v).mul(-0.5))) // GLSL: cos(a) / l * exp(-.5*v*v)

          // GLSL: ... * dx -- the path the boat covered in one sample (strength = speed / top speed)
          const covered = strength.mul(BOAT.maxSpeed * WAKE.interval / W.substeps)
          const fade = float(1).sub(smoothstep(float(W.fadeAge[0]), float(W.fadeAge[1]), t))
          total.addAssign(pulse.mul(covered).mul(fade))
        }
      })
    })
  })

  // CHANGED: right on the path the samples are further apart than the waves are long and the sum
  // turns into a lattice of artefacts; the propeller wash covers that strip anyway, so fade out.
  const offPath = smoothstep(float(W.pathFade[0]), float(W.pathFade[1]), nearest)

  return total.mul(W.gain).mul(near).mul(offPath) // GLSL: * 1.7e3/S (the gain, tuned by eye)
})
