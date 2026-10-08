import { Group, Mesh, IcosahedronGeometry, MeshStandardNodeMaterial, Vector3, Quaternion } from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PLANET, CLOUDS } from '../config.js'
import { uniforms } from '../uniforms.js'

// Low-poly clouds: a few squashed, lumpy icosahedra merged into one mesh each,
// flat shaded like everything else. Clouds are spread over a shell around the
// planet and drift slowly. Cloud cover grows and shrinks them (each cloud has
// its own threshold), so a storm front visibly builds up.

const smooth = (t) => t * t * (3 - 2 * t)

// Deterministic pseudo random numbers so the clouds look the same every run.
function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createCloudGeometry(random) {
  const blobs = []
  const count = 4 + Math.floor(random() * 4)
  for (let i = 0; i < count; i++) {
    const radius = 0.55 + random() * 0.6
    const blob = new IcosahedronGeometry(radius, 1)

    // Lumpy surface: push each vertex out/in by a hash of its own position, so
    // vertices that share a position move together and no cracks open.
    const position = blob.attributes.position
    for (let v = 0; v < position.count; v++) {
      const [x, y, z] = [position.getX(v), position.getY(v), position.getZ(v)]
      const hash = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719) * 43758.5453
      const push = 1 + ((hash - Math.floor(hash)) - 0.5) * 0.35
      position.setXYZ(v, x * push, y * push, z * push)
    }

    blob.scale(1, 0.5, 1) // flat bottom-ish, like a cumulus
    blob.translate((random() - 0.5) * 2.6, (random() - 0.3) * 0.35, (random() - 0.5) * 1.8)
    blobs.push(blob)
  }
  return mergeGeometries(blobs)
}

export function createClouds() {
  const random = mulberry32(7)
  const group = new Group()
  group.name = 'clouds'

  const material = new MeshStandardNodeMaterial({ flatShading: true, roughness: 1, metalness: 0 })
  material.colorNode = uniforms.cloudColor // grey-blue in storms, near white in fair weather

  const geometries = Array.from({ length: 6 }, () => createCloudGeometry(random))

  const clouds = []
  const [up, tilt] = [new Vector3(0, 1, 0), new Quaternion()]
  for (let i = 0; i < CLOUDS.count; i++) {
    // Fibonacci sphere: evenly spread directions, then a little jitter.
    const y = 1 - (2 * (i + 0.5)) / CLOUDS.count
    const ring = Math.sqrt(1 - y * y)
    const angle = i * Math.PI * (3 - Math.sqrt(5)) + (random() - 0.5) * 0.4
    const dir = new Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring)

    const mesh = new Mesh(geometries[i % geometries.length], material)
    const altitude = CLOUDS.minAltitude + random() * (CLOUDS.maxAltitude - CLOUDS.minAltitude)
    mesh.position.copy(dir).multiplyScalar(PLANET.radius + altitude)
    mesh.quaternion.copy(tilt.setFromUnitVectors(up, dir)).multiply(new Quaternion().setFromAxisAngle(up, random() * Math.PI * 2))

    clouds.push({ mesh, threshold: random(), size: 0.9 + random() * 0.7 })
    group.add(mesh)
  }

  const windAxis = new Vector3(...CLOUDS.windAxis).normalize()

  return {
    group,
    // `cover` 0..1 from the weather, `spaceAmount` 0..1 (planet view shrinks the clouds so
    // they do not hide the boat).
    update(delta, cover, spaceAmount) {
      group.rotateOnAxis(windAxis, CLOUDS.windSpeed * delta)
      for (const cloud of clouds) {
        const grow = smooth(Math.min(1, Math.max(0, (cover - cloud.threshold) / 0.2 + 0.5)))
        const scale = cloud.size * grow * (1 - 0.85 * spaceAmount)
        cloud.mesh.visible = scale > 0.02
        cloud.mesh.scale.setScalar(Math.max(scale, 0.0001))
      }
    },
  }
}
