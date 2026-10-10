import { Vector3 } from 'three/webgpu'
import { PLANET } from '../config.js'
import { simplex3d } from './simplexNoise.js'

// The single definition of an island's shape: used to build the terrain mesh
// (scene/terrain.js) and to collide with it (physics/collision.js), so what you
// see is exactly what you bump into.
//
// An island is described in polar form around its centre direction:
//   u      0 at the centre .. 1 at the outer rim of the mesh
//   theta  bearing around the centre, counter-clockwise seen from outside
// and has a wobbly coastline (`coast`), a plateau height profile and noise on top.

const R = PLANET.radius
export const BASE = -0.7 // height of the outer rim relative to sea level
const CONTOUR_SAMPLES = 72

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const profile = (u) => smoothstep(1, 0.3, u) // 1 on the plateau, 0 at the rim

// The u at which the profile crosses sea level for a given peak height.
function shorelineU(height) {
  const target = -BASE / (height - BASE)
  let [lo, hi] = [0.3, 1]
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2
    if (profile(mid) > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

// Tangent frame at the island centre: (t1, t2, centre) is right-handed, so theta runs
// counter-clockwise seen from outside.
export function islandFrame(centre) {
  const axis = Math.abs(centre.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
  const t1 = new Vector3().crossVectors(centre, axis).normalize()
  const t2 = new Vector3().crossVectors(centre, t1)
  return { t1, t2 }
}

export function createIslandShape(island) {
  const centre = island.dir
  const { t1, t2 } = islandFrame(centre)
  const outer = island.radius / shorelineU(island.height) // distance from the centre to the rim, world units
  const [sx, sy, sz] = [island.seed, island.seed * 0.7 + 3.1, island.seed * 1.3 + 7.7]

  const coast = (theta) => 1 + 0.14 * simplex3d(Math.cos(theta) * 1.3 + sx, Math.sin(theta) * 1.3 + sy, sz)

  // Point on the island at ring position u (0..1) and bearing theta.
  function pointAt(u, theta) {
    const angle = (u * outer * coast(theta)) / R
    const dir = centre.clone().multiplyScalar(Math.cos(angle))
      .addScaledVector(t1, Math.cos(theta) * Math.sin(angle))
      .addScaledVector(t2, Math.sin(theta) * Math.sin(angle))
    const n = simplex3d((dir.x * R) / 0.8 + sx, (dir.y * R) / 0.8 + sy, (dir.z * R) / 0.8 + sz)
    const shape = Math.max(0, profile(u) * (1 + 0.22 * n))
    const height = BASE + (island.height - BASE) * shape
    return { dir, height, point: dir.clone().multiplyScalar(R + height) }
  }

  // The real shoreline: for each bearing, walk inwards from the rim until the ground
  // rises above sea level. Stored as a table of distances from the centre (world units).
  const contour = new Float32Array(CONTOUR_SAMPLES)
  for (let i = 0; i < CONTOUR_SAMPLES; i++) {
    const theta = (i / CONTOUR_SAMPLES) * Math.PI * 2
    for (let k = 100; k >= 0; k--) {
      const u = k / 100
      if (pointAt(u, theta).height >= 0) {
        contour[i] = u * outer * coast(theta)
        break
      }
    }
  }

  // Tidy the table so the collision behaves: take the largest value among the neighbours (so a
  // detached bump of land is not skipped) and blur it a little (so there are no needle-sharp
  // spikes, whose normals would point sideways).
  const widened = contour.map((_, i) => Math.max(contour[(i + CONTOUR_SAMPLES - 1) % CONTOUR_SAMPLES], contour[i], contour[(i + 1) % CONTOUR_SAMPLES]))
  for (let i = 0; i < CONTOUR_SAMPLES; i++) {
    contour[i] = (widened[(i + CONTOUR_SAMPLES - 2) % CONTOUR_SAMPLES] + 2 * widened[(i + CONTOUR_SAMPLES - 1) % CONTOUR_SAMPLES] + 3 * widened[i] + 2 * widened[(i + 1) % CONTOUR_SAMPLES] + widened[(i + 2) % CONTOUR_SAMPLES]) / 9
  }
  const smoothed = Float32Array.from(contour)
  for (let i = 0; i < CONTOUR_SAMPLES; i++) contour[i] = Math.max(smoothed[i], widened[i] * 0.97) // never shrink much below the real shore

  // Shoreline distance from the centre at any bearing (linear interpolation, wraps around).
  function shorelineAt(theta) {
    const position = (((theta / (Math.PI * 2)) % 1) + 1) % 1 * CONTOUR_SAMPLES
    const i = Math.floor(position)
    const f = position - i
    return contour[i % CONTOUR_SAMPLES] * (1 - f) + contour[(i + 1) % CONTOUR_SAMPLES] * f
  }

  // d(shoreline)/d(theta), for the contour's slope (used to find the coast's normal).
  function shorelineSlope(theta) {
    const e = (Math.PI * 2) / CONTOUR_SAMPLES
    return (shorelineAt(theta + e) - shorelineAt(theta - e)) / (2 * e)
  }

  return { centre, t1, t2, outer, pointAt, shorelineAt, shorelineSlope, maxShoreline: Math.max(...contour) }
}
