import { InstancedMesh, IcosahedronGeometry, Matrix4, Vector3 } from 'three/webgpu'
import { PLANET, FISHING } from '../config.js'
import { uniforms } from '../uniforms.js'
import { sampleHeight } from '../physics/waves.js'
import { createFishingBubbleMaterial } from '../tsl/fishingBubbles.js'

const R = PLANET.radius
const arc = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * R // distance over the sea

// The fishing spots: patches of bubbling water where the fish are. The positions come from
// world/layout.js (`layout.fishingSpots`); this draws them (one instanced mesh, animated entirely in
// tsl/fishingBubbles.js) and keeps track of which ones are worth fishing: a spot that gave up a fish
// stays empty (its bubbles dying away) until refill() is called, which main.js does at midnight. Which spot you are at and the fight itself are main.js' and the minigame's business.
export function createFishingSpots(list) {
  const { bubbles } = FISHING.spots
  const { material, frame, visible } = createFishingBubbleMaterial(list.length)

  const mesh = new InstancedMesh(new IcosahedronGeometry(1, 0), material, Math.max(1, list.length * bubbles))
  const identity = new Matrix4()
  for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, identity) // the shader places every bubble itself
  mesh.instanceMatrix.needsUpdate = true
  mesh.name = 'fishing-spots'
  mesh.frustumCulled = false
  mesh.renderOrder = 2

  const spots = list.map((spot, index) => {
    // Any tangent will do as the shader's reference direction.
    const tangent = new Vector3(0, 1, 0).cross(spot.dir)
    if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0).cross(spot.dir)
    tangent.normalize()
    frame.array[index].set(tangent.x, tangent.y, tangent.z, 0)
    return { index, dir: spot.dir, seed: spot.seed, empty: false, level: 1 }
  })

  return {
    mesh,
    spots,

    // `delta` is real time (the bubbles fade in and out even while the game is paused); `space` is 0
    // in the chase view and 1 in planet view.
    update({ delta, time, storm, space }) {
      const ease = 1 - Math.exp(-delta * 1.2)
      for (const spot of spots) {
        spot.level += ((spot.empty ? 0 : 1) - spot.level) * ease
        const { x, y, z } = spot.dir
        uniforms.fishingSpots.array[spot.index].set(x, y, z, spot.level)
        frame.array[spot.index].w = sampleHeight(spot.dir, time, storm) // the water there, from the CPU twin of the waves
      }
      visible.value = 1 - space // the bubbles are for the chase view; from space the foam patch marks the spot
    },

    // The nearest spot with fish in it within `radius` of `dir` (a unit direction from the planet
    // centre, over the sea), as { spot, distance }, or null.
    nearest(dir, radius) {
      let best = null
      for (const spot of spots) {
        if (spot.empty) continue
        const distance = arc(dir, spot.dir)
        if (distance <= radius && (!best || distance < best.distance)) best = { spot, distance }
      }
      return best
    },

    // A fish was landed here: the spot is empty until refill().
    deplete(spot) {
      spot.empty = true
    },

    // Every spot bubbles up again (at midnight).
    refill() {
      for (const spot of spots) spot.empty = false
    },
  }
}
