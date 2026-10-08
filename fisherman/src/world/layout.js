import { Vector3 } from 'three/webgpu'
import { PLANET, WORLD, BOAT } from '../config.js'
import { createIslandShape } from '../physics/islandShape.js'

// Where everything in the world goes. Fully deterministic (seeded), and shared by
// the renderer (scene/world.js), the water shader (shore foam) and the boat
// physics (collisions).

const R = PLANET.radius

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const arc = (a, b) => Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * R // distance along the surface

// A point `distance` radians from the start in direction `bearing` degrees
// (0 = initial heading, +90 = starboard).
function fromStart(start, bearingDeg, distance) {
  const up = start.dir
  const forward = start.heading.clone().addScaledVector(up, -start.heading.dot(up)).normalize()
  const right = new Vector3().crossVectors(forward, up)
  const bearing = (bearingDeg * Math.PI) / 180
  const along = forward.multiplyScalar(Math.cos(bearing)).addScaledVector(right, Math.sin(bearing))
  return up.clone().multiplyScalar(Math.cos(distance)).addScaledVector(along, Math.sin(distance)).normalize()
}

function randomDirection(random) {
  const z = random() * 2 - 1
  const angle = random() * Math.PI * 2
  const ring = Math.sqrt(1 - z * z)
  return new Vector3(Math.cos(angle) * ring, z, Math.sin(angle) * ring)
}

export function createLayout() {
  const random = mulberry32(WORLD.seed)
  const start = {
    dir: new Vector3(...WORLD.start.dir).normalize(),
    heading: new Vector3(...WORLD.start.heading),
  }

  // The outer edge of an island mesh reaches about 1.4x the shoreline radius.
  const footprint = (radius) => radius * 1.4

  const islands = WORLD.landmarks.map((landmark) => ({
    ...landmark,
    dir: fromStart(start, landmark.bearing, landmark.distance),
    seed: random() * 100,
  }))

  const clear = (dir, extent, gap) =>
    arc(dir, start.dir) > WORLD.startClear + extent &&
    islands.every((island) => arc(dir, island.dir) > footprint(island.radius) + extent + gap)

  // Scattered islands: rejection sampling so none overlap each other or the start.
  const { scattered } = WORLD
  for (let tries = 0; islands.length < WORLD.landmarks.length + scattered.islands && tries < 4000; tries++) {
    const radius = scattered.minRadius + (scattered.maxRadius - scattered.minRadius) * random() ** 1.5
    const dir = randomDirection(random)
    if (!clear(dir, footprint(radius), scattered.gap)) continue
    islands.push({
      name: `island-${islands.length}`,
      dir,
      radius,
      height: 0.5 + radius * 0.5 + random() * 0.3,
      trees: Math.min(45, Math.max(4, Math.round(radius * radius * 11))),
      treeKind: random() < 0.6 ? 'pine' : 'autumn',
      ground: random() < 0.7 ? 'grass' : random() < 0.6 ? 'autumn' : 'rock',
      seed: random() * 100,
    })
  }

  // Rocks sticking out of open water.
  const rocks = []
  for (let tries = 0; rocks.length < scattered.seaRocks && tries < 4000; tries++) {
    const radius = 0.12 + random() * 0.16
    const dir = randomDirection(random)
    if (clear(dir, radius, 0.5) && rocks.every((rock) => arc(dir, rock.dir) > 0.8)) rocks.push({ dir, radius, seed: random() * 100 })
  }

  // Buoys: a hand-placed route, then a few in open water.
  const route = WORLD.buoyRoute.map((b) => ({ dir: fromStart(start, b.bearing, b.distance), heading: new Vector3(1, 0, 0) }))
  const buoys = route.filter((b) => islands.every((island) => arc(b.dir, island.dir) > island.radius * 1.4 + 0.3)) // never on land
  for (let tries = 0; buoys.length < route.length + WORLD.scatteredBuoys && tries < 4000; tries++) {
    const dir = randomDirection(random)
    if (clear(dir, 0.3, 0.6) && rocks.every((rock) => arc(dir, rock.dir) > rock.radius + 0.8) && buoys.every((b) => arc(dir, b.dir) > 1.2)) {
      buoys.push({ dir, heading: new Vector3(1, 0, 0) })
    }
  }

  // What the boat cannot sail through, and what the water draws shore foam around.
  // Islands get their exact coastline (a table of shoreline distances per bearing);
  // rocks are plain circles.
  for (const island of islands) island.shape = createIslandShape(island)
  const colliders = [
    ...islands.map((island) => ({ kind: 'island', dir: island.dir, shape: island.shape, reach: island.shape.maxShoreline + BOAT.shoreMargin })),
    ...rocks.map((rock) => ({ kind: 'circle', dir: rock.dir, radius: rock.radius + BOAT.shoreMargin, reach: rock.radius + BOAT.shoreMargin })),
  ]
  const bodies = [
    ...islands.map((island) => ({ dir: island.dir, radius: island.radius })),
    ...rocks.map((rock) => ({ dir: rock.dir, radius: rock.radius })),
  ]

  return { start, islands, rocks, buoys, colliders, bodies }
}
