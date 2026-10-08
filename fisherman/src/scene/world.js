import { Group, InstancedMesh, MeshStandardNodeMaterial, Matrix4, Quaternion, Vector3, Color } from 'three/webgpu'
import { PLANET, WORLD, WORLD_PALETTE as P } from '../config.js'
import { uniforms } from '../uniforms.js'
import { createTerrain } from './terrain.js'
import { createPineGeometry, createAutumnTreeGeometry, createRockGeometry } from './props.js'
import { createLighthouse } from './lighthouse.js'
import { createBuoys } from './buoys.js'

const R = PLANET.radius
const UP = new Vector3(0, 1, 0)

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Orientation for something standing on the surface at `dir`, turned by a random yaw.
const standing = (dir, yaw) =>
  new Quaternion().setFromUnitVectors(UP, dir).multiply(new Quaternion().setFromAxisAngle(UP, yaw))

// Random spots on an island, away from each other, on gentle ground above the beach.
function scatter(island, terrain, count, [minU, maxU], random, { minHeight, maxHeight }) {
  const spots = []
  for (let tries = 0; spots.length < count && tries < count * 40; tries++) {
    const u = minU + (maxU - minU) * Math.sqrt(random())
    const theta = random() * Math.PI * 2
    const spot = terrain.pointAt(u, theta)
    if (spot.height < minHeight || spot.height > maxHeight) continue
    const uphill = terrain.pointAt(Math.min(1, u + 0.04), theta)
    if (Math.abs(uphill.height - spot.height) / (0.04 * terrain.outer) > 0.9) continue // too steep (cliff)
    if (spots.some((other) => other.dir.distanceTo(spot.dir) * R < 0.24)) continue
    spots.push(spot)
  }
  return spots
}

// Builds everything that stands on or floats around the planet: islands (terrain,
// trees, rocks), the lighthouse and the buoys. Also tells the water shader where
// the shores are. `update` animates the lighthouse and buoys.
export function createWorld(layout) {
  const group = new Group()
  group.name = 'world'
  const random = mulberry32(WORLD.seed + 1)
  const items = { pine: [], autumn: [], rock: [] }
  const add = (kind, position, quaternion, scale, color) => items[kind].push({ position, quaternion, scale, color })

  const leaf = P.autumnLeaves.map((hex) => new Color(hex))
  let lighthouse = null

  for (const island of layout.islands) {
    const terrain = createTerrain(island)
    group.add(terrain.mesh)

    // Trees on the plateau and upper slopes; the lighthouse island keeps its centre free.
    const treeSpots = scatter(island, terrain, island.trees, [island.lighthouse ? 0.2 : 0.05, 0.6], random, {
      minHeight: island.height * 0.25, maxHeight: Infinity,
    })
    for (const spot of treeSpots) {
      const size = 0.8 + random() * 0.7
      const position = spot.dir.clone().multiplyScalar(R + spot.height - 0.02)
      const quaternion = standing(spot.dir, random() * Math.PI * 2)
      if (island.treeKind === 'autumn') {
        const target = leaf[Math.floor(random() * leaf.length)]
        const tint = new Color(target.r / leaf[0].r, target.g / leaf[0].g, target.b / leaf[0].b).multiplyScalar(0.85 + random() * 0.3)
        add('autumn', position, quaternion, new Vector3(size, size, size), tint)
      } else {
        const shade = 0.8 + random() * 0.4
        add('pine', position, quaternion, new Vector3(size, size * (0.9 + random() * 0.4), size), new Color(shade, shade, shade))
      }
    }

    // A few rocks at the waterline.
    for (const spot of scatter(island, terrain, 4, [0.55, 0.95], random, { minHeight: -0.1, maxHeight: 0.25 })) {
      const size = 0.08 + random() * 0.16
      const shade = 0.8 + random() * 0.35
      add('rock', spot.dir.clone().multiplyScalar(R + spot.height), standing(spot.dir, random() * 6.28), new Vector3(size, size * 0.7, size), new Color(shade, shade, shade))
    }

    if (island.lighthouse) {
      lighthouse = createLighthouse()
      lighthouse.root.position.copy(terrain.centre.point)
      lighthouse.root.quaternion.copy(standing(terrain.centre.dir, 0))
      group.add(lighthouse.root)
    }
  }

  // Rocks in open water.
  for (const rock of layout.rocks) {
    const shade = 0.8 + random() * 0.3
    add('rock', rock.dir.clone().multiplyScalar(R + 0.01), standing(rock.dir, random() * 6.28), new Vector3(rock.radius, rock.radius * 1.1, rock.radius), new Color(shade, shade, shade))
  }

  // One InstancedMesh per kind of prop.
  const material = new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, metalness: 0 })
  const geometries = { pine: createPineGeometry(), autumn: createAutumnTreeGeometry(), rock: createRockGeometry() }
  const matrix = new Matrix4()
  for (const [kind, list] of Object.entries(items)) {
    if (!list.length) continue
    const mesh = new InstancedMesh(geometries[kind], material, list.length)
    list.forEach((item, i) => {
      mesh.setMatrixAt(i, matrix.compose(item.position, item.quaternion, item.scale))
      mesh.setColorAt(i, item.color)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    mesh.name = `${kind}s`
    group.add(mesh)
  }

  // Shore foam in the water shader.
  layout.bodies.forEach((body, i) => uniforms.shoreBodies.array[i].set(body.dir.x, body.dir.y, body.dir.z, body.radius))

  const buoys = createBuoys(layout.buoys)
  group.add(buoys.group)

  return {
    group,
    lighthouse,
    // `darkness` 0..1: lamps on the lighthouse and buoys switch on with it.
    update(elapsed, storm, darkness) {
      lighthouse?.update(elapsed, darkness)
      buoys.update(elapsed, storm, darkness)
    },
  }
}
