import { Fn, Loop, float, length, sin, smoothstep, max } from 'three/tsl'
import { PLANET, FISHING } from '../config.js'
import { uniforms } from '../uniforms.js'

// Foam (0..1) on the water where the fish are: a disc of FISHING.spots.patch radius around each spot
// with rings that lap outwards, fading away with the spot's bubbles (w of `uniforms.fishingSpots`).
// Evaluated per vertex and drawn flat per triangle, like the shore foam (see tsl/shore.js), so it has
// the same faceted look. It is what marks a spot from far away and from planet view.
export const spotFoam = Fn(([dir]) => {
  const foam = float(0).toVar()
  const radius = FISHING.spots.patch

  Loop(FISHING.spots.count, ({ i }) => {
    const spot = uniforms.fishingSpots.element(i) // xyz = direction, w = fullness
    const distance = length(dir.sub(spot.xyz)).mul(PLANET.radius)
    const disc = float(1).sub(smoothstep(float(radius * 0.55), float(radius), distance))
    const rings = sin(distance.mul(16).sub(uniforms.time.mul(2.4))).mul(0.3).add(0.7)
    foam.assign(max(foam, disc.mul(rings).mul(spot.w)))
  })

  return foam
})
