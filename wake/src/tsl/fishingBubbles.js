import { MeshBasicNodeMaterial, Color, Vector4 } from 'three/webgpu'
import {
  Fn, float, int, color, uniform, uniformArray, instanceIndex, positionLocal, normalLocal, cross, fract, floor, sin, cos, sqrt, smoothstep,
} from 'three/tsl'
import { PLANET, FISHING } from '../config.js'
import { uniforms } from '../uniforms.js'

// The bubbles over the fishing spots, with no per-frame JavaScript per bubble (the same idea as
// tsl/rainMaterial.js). One instanced mesh holds `bubbles` instances for every spot; the vertex shader
// works out which spot an instance belongs to from its index, and where the bubble is from the
// clock: it starts below the surface, rises while it grows, and shrinks to nothing as it pops. The
// only things JavaScript writes are per spot (scene/fishingSpots.js):
//   uniforms.fishingSpots  xyz = the spot's direction from the planet centre, w = how full of bubbles
//                          it is (0 = empty, 1 = bubbling); the water's foam patch reads it too
//   frame                  xyz = a tangent at the spot, w = the height of the water there
const hash = Fn(([x]) => fract(sin(x.mul(127.1)).mul(43758.5453)))

export function createFishingBubbleMaterial(spotCount) {
  const { bubbles, radius, rise, size, speed } = FISHING.spots
  const blank = (x, y, z) => Array.from({ length: spotCount }, () => new Vector4(x, y, z, 0))
  const frame = uniformArray(blank(1, 0, 0), 'vec4')

  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })

  const id = float(instanceIndex)
  const spotIndex = floor(id.div(bubbles))
  const seed = id.sub(spotIndex.mul(bubbles)).add(spotIndex.mul(31.7)) // differs between bubbles and between spots
  const [r1, r2, r3, r4] = [0, 11.7, 23.3, 37.9].map((offset) => hash(seed.add(offset)))

  const spot = uniforms.fishingSpots.element(int(spotIndex))
  const side = frame.element(int(spotIndex))
  const up = spot.xyz
  const tangent = side.xyz
  const bitangent = cross(up, tangent)
  const fullness = spot.w

  // 0 -> 1 over the life of a bubble; each one runs at its own speed and starts at its own moment.
  const life = fract(uniforms.time.mul(speed).mul(r3.mul(0.6).add(0.7)).add(r4))

  // Where: a random spot in the patch (sqrt: even over the disc), drifting a little as it rises,
  // from 0.2 below the water to `rise` above it.
  const angle = r1.mul(Math.PI * 2)
  const spread = sqrt(r2).mul(radius)
  const drift = sin(uniforms.time.mul(2.2).add(r4.mul(20))).mul(0.03)
  const height = life.mul(rise + 0.2).sub(0.2)
  const centre = up.mul(float(PLANET.radius).add(side.w).add(height))
    .add(tangent.mul(cos(angle).mul(spread).add(drift)))
    .add(bitangent.mul(sin(angle).mul(spread)))

  // How big: grows after it leaves the depths, shrinks as it reaches the top. Empty spots collapse
  // every bubble to a point (degenerate triangles).
  const pop = smoothstep(float(0), float(0.2), life).mul(float(1).sub(smoothstep(float(0.8), float(1), life)))
  const radiusNow = r2.mul(0.6).add(0.6).mul(size).mul(pop).mul(fullness)
  material.positionNode = centre.add(positionLocal.mul(radiusNow))

  // Unlit, pale blue-white, a little brighter on the upward faces so the facets read; it is dimmer at
  // night: dimmer, and never above 1, so the bloom leaves it alone.
  const night = float(1).sub(smoothstep(float(-0.15), float(0.4), uniforms.sunElevation))
  const facet = normalLocal.y.mul(0.3).add(0.85)
  material.colorNode = color(new Color(FISHING.spots.color)).mul(facet).mul(float(1).sub(night.mul(0.45)))
  material.opacityNode = float(FISHING.spots.opacity)

  return { material, frame }
}
