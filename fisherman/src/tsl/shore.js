import { Fn, Loop, float, length, sin, smoothstep, max } from 'three/tsl'
import { PLANET, WORLD } from '../config.js'
import { uniforms } from '../uniforms.js'

// Foam (0..1) where the water meets an island or rock. `uniforms.shoreBodies`
// holds the centre direction and shoreline radius of each one; the foam is a band
// that starts at the shoreline and fades out over 0.4 units, with slowly lapping
// bands inside it. Unused slots have a negative radius and contribute nothing.
export const shoreFoam = Fn(([dir]) => {
  const foam = float(0).toVar()

  Loop(WORLD.maxBodies, ({ i }) => {
    const body = uniforms.shoreBodies.element(i) // xyz = direction, w = shoreline radius
    const distance = length(dir.sub(body.xyz)).mul(PLANET.radius)
    const band = float(1).sub(smoothstep(body.w, body.w.add(0.4), distance))
    const lapping = sin(distance.mul(9).sub(uniforms.time.mul(1.6))).mul(0.25).add(0.75)
    foam.assign(max(foam, band.mul(lapping)))
  })

  return foam
})
