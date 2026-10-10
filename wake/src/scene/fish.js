import { Vector3 } from 'three/webgpu'
import { PLANET, FISH } from '../config.js'
import { createBoids } from '../tsl/boids.js'

const R = PLANET.radius

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Where the schools start: a few close to the start of the game (so there is something to see
// from the beginning), the rest anywhere, all in open water (not inside an island or a rock).
function startingState(layout) {
  const random = mulberry32(20261009)
  const schools = Math.ceil(FISH.count / FISH.schoolSize)
  const dir = new Float32Array(FISH.count * 4)
  const vel = new Float32Array(FISH.count * 4)

  const inOpenWater = (d) => layout.bodies.every((b) => Math.acos(Math.min(1, d.dot(b.dir))) * R > b.radius * 1.45 + 0.8)
  const randomDirection = () => {
    const z = random() * 2 - 1, a = random() * Math.PI * 2, r = Math.sqrt(1 - z * z)
    return new Vector3(Math.cos(a) * r, z, Math.sin(a) * r)
  }
  const start = layout.start.dir.clone()
  const nearStart = () => {
    const forward = layout.start.heading.clone().addScaledVector(start, -layout.start.heading.dot(start)).normalize()
    const right = new Vector3().crossVectors(forward, start)
    const angle = random() * Math.PI * 2
    const away = (1.3 + random() * 1.8) / R // 1.3 .. 3.1 units from the start
    return start.clone().multiplyScalar(Math.cos(away)).addScaledVector(forward.multiplyScalar(Math.cos(angle)).addScaledVector(right, Math.sin(angle)), Math.sin(away)).normalize()
  }

  const centres = []
  for (let s = 0; s < schools; s++) {
    let centre
    for (let tries = 0; tries < 400; tries++) {
      centre = s < FISH.nearSchools ? nearStart() : randomDirection()
      if (inOpenWater(centre)) break
    }
    centres.push(centre)
  }

  for (let i = 0; i < FISH.count; i++) {
    const school = Math.floor(i / FISH.schoolSize)
    const centre = centres[school]
    // A random tangent frame at the school's centre.
    const axis = Math.abs(centre.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0)
    const t1 = new Vector3().crossVectors(centre, axis).normalize()
    const t2 = new Vector3().crossVectors(centre, t1)
    const angle = random() * Math.PI * 2
    const spread = Math.sqrt(random()) * 0.4 / R // inside a disc of 0.4 units
    const d = centre.clone().multiplyScalar(Math.cos(spread)).addScaledVector(t1, Math.cos(angle) * Math.sin(spread)).addScaledVector(t2, Math.sin(angle) * Math.sin(spread)).normalize()
    dir.set([d.x, d.y, d.z, random()], i * 4) // .w = the fish's own phase

    // The school's heading, a little different for each fish (velocities are in the original's units)
    const heading = school * 2.399963
    const h = t1.clone().multiplyScalar(Math.cos(heading + (random() - 0.5) * 0.8)).addScaledVector(t2, Math.sin(heading + (random() - 0.5) * 0.8))
    h.addScaledVector(d, -h.dot(d)).normalize().multiplyScalar(0.05 + random() * 0.03)
    vel.set([h.x, h.y, h.z, school], i * 4) // .w = the school
  }
  return { dir, vel }
}

// The fish: a boids simulation on the GPU (tsl/boids.js, ported from Shadertoy "Schooling").
// They are not drawn as objects: the water paints their shadows (tsl/fishShadows.js).
export function createFish(renderer, layout) {
  const boids = createBoids(startingState(layout))
  return {
    boids,
    // `boatSpeed01`: the boat's speed as a fraction of its normal top speed.
    update(delta, boatSpeed01, anchored) {
      boids.step(renderer, delta, anchored ? 0.25 : 0.5 + boatSpeed01)
    },
    // For the tests: the fish's current directions and velocities, read back from the GPU.
    async snapshot() {
      const read = async (node) => new Float32Array(await renderer.getArrayBufferAsync(node.value))
      return { dir: await read(boids.drawDir), vel: await read(boids.drawVel) }
    },
  }
}
