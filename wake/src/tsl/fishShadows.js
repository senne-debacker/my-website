import { Fn, Loop, float, vec3, dot, cross, smoothstep } from 'three/tsl'
import { PLANET, FISH } from '../config.js'

const R = PLANET.radius

// The fish seen as shadows on the water: soft, dark ellipses, one under each fish, pointing the way
// it swims. This is part of the WATER'S colour (see tsl/waterMaterial.js), not separate shapes
// above it, so a shadow always lies exactly on the surface, on the waves, in any weather.
//
// For a point on the sea, in direction `dir` from the planet's centre, it loops over all the
// fish (their positions are in the boids' storage buffers: tsl/boids.js) and returns how dark
// the sea is there, 0..1: for each fish the point's offset from it, in the fish's own frame, goes
// into an ellipse equation, and the shadow fades smoothly from the centre of the ellipse to its edge.
export const fishShadow = ({ drawDir, drawFwd }) => Fn(([dir]) => {
  const darkest = float(0).toVar()
  Loop(FISH.count, ({ i }) => {
    const fish = drawDir.element(i) // xyz = direction, w = strength (deeper fish: fainter)
    const frame = drawFwd.element(i) // xyz = the way it swims, w = size
    const offset = dir.sub(fish.xyz).mul(R) // from the fish to this point, in world units (the chord: the same as the arc here)
    const along = dot(offset, frame.xyz)
    const across = dot(offset, cross(frame.xyz, fish.xyz))
    const halfLength = frame.w.mul(FISH.size * 0.62)
    const halfWidth = halfLength.mul(0.42)
    const e = along.div(halfLength).pow(2).add(across.div(halfWidth).pow(2)) // 1 on the edge of the ellipse
    darkest.assign(darkest.max(float(1).sub(smoothstep(float(0), float(1), e)).mul(fish.w)))
  })
  return darkest
})
