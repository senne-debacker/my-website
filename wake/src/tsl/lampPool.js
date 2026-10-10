import { Fn, float, cross, dot, length, smoothstep, exp } from 'three/tsl'
import { PLANET, BOAT_LIGHT as L } from '../config.js'
import { uniforms } from '../uniforms.js'

// The glow of the bow lamp on the water, computed along the curved surface.
//
// A straight spotlight cannot light water beyond the planet's horizon: the sea curves away under
// the beam (from a lamp 0.3 above the water the horizon is only about 1.7 units away). So the
// water draws the lamp's pool of light itself, measured over the surface of the sphere:
//   s         distance from the boat along the water
//   sideways  how far the point is to the side of the bow direction, seen from the boat
//   pool    = cone(sideways) * fade with distance * (starts just ahead of the bow)
// It is added as emitted light, so it works where the real SpotLight does not reach.
// `dir` is the unit direction (from the planet centre) of the water point; the result is 0..1.
export const lampPool = Fn(([dir]) => {
  const here = uniforms.lampDir
  const forward = uniforms.lampForward
  const port = cross(here, forward)

  const tangent = dir.sub(here.mul(dot(dir, here))) // the part of `dir` that lies in the water plane at the boat
  const heading = tangent.div(length(tangent).max(1e-4))
  const cosAhead = dot(heading, forward)
  const sideways = dot(heading, port).abs()
  const s = length(dir.sub(here)).mul(PLANET.radius) // chord length, about the same as the arc

  const ahead = smoothstep(float(0), float(0.25), cosAhead) // nothing behind the boat
  const edge = Math.sin(L.pool.halfAngle)
  const cone = float(1).sub(smoothstep(float(edge * 0.5), float(edge), sideways)).mul(ahead)
  const reach = float(1).sub(smoothstep(float(L.pool.length * 0.35), float(L.pool.length), s))
  const warmUp = smoothstep(float(L.pool.start), float(L.pool.start + 0.5), s) // fades in just ahead of the bow
  const hotSpot = exp(s.mul(-0.35)).mul(0.6).add(0.4) // brightest near the boat

  return cone.mul(reach).mul(warmUp).mul(hotSpot)
})
