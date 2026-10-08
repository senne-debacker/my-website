import { BufferGeometry, Float32BufferAttribute, Mesh, MeshStandardNodeMaterial, Color, Vector3 } from 'three/webgpu'
import { PLANET, WORLD_PALETTE as P } from '../config.js'
import { createIslandShape } from '../physics/islandShape.js'

// One low-poly island, built as a polar grid on the sphere: a centre vertex,
// RINGS rings of SEGMENTS vertices. Each vertex sits at
//   direction  = the island centre rotated by (ring distance) along (bearing)
//   height     = a plateau profile * simplex noise, measured above sea level
// and the outer rim dips well below the waves so no skirt ever shows. The mesh
// is non-indexed with one colour per triangle (cliff, sand, grass ...) so it
// matches the flat-shaded look of the water.

const R = PLANET.radius
const RINGS = 10
const SEGMENTS = 28

export function createTerrain(island) {
  // The shape (coastline, heights) is shared with the collision code.
  const shape = island.shape ?? createIslandShape(island)
  const { pointAt, outer } = shape

  // Vertex grid.
  const grid = [[pointAt(0, 0)]]
  for (let ring = 1; ring <= RINGS; ring++) {
    grid.push(Array.from({ length: SEGMENTS }, (_, j) => pointAt(ring / RINGS, (j / SEGMENTS) * Math.PI * 2)))
  }
  const at = (ring, j) => (ring === 0 ? grid[0][0] : grid[ring][((j % SEGMENTS) + SEGMENTS) % SEGMENTS])

  // Triangles, wound counter-clockwise seen from outside.
  const triangles = []
  for (let j = 0; j < SEGMENTS; j++) triangles.push([at(0, 0), at(1, j), at(1, j + 1)])
  for (let ring = 2; ring <= RINGS; ring++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const [a, b, c, d] = [at(ring - 1, j), at(ring - 1, j + 1), at(ring, j), at(ring, j + 1)]
      triangles.push([a, c, d], [a, d, b])
    }
  }

  // Non-indexed geometry with one colour per triangle.
  const colours = {
    sand: new Color(P.sand), cliff: new Color(P.cliff), cliffDark: new Color(P.cliffDark),
    top: new Color({ grass: P.grass, autumn: P.autumnGround, rock: P.rockTop }[island.ground] ?? P.grass),
  }
  const positions = []
  const colors = []
  const [edge1, edge2, normal, centroid, tint] = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Color()]
  triangles.forEach((triangle, index) => {
    centroid.set(0, 0, 0)
    for (const vertex of triangle) {
      centroid.add(vertex.point)
      positions.push(vertex.point.x, vertex.point.y, vertex.point.z)
    }
    centroid.divideScalar(3)
    edge1.subVectors(triangle[1].point, triangle[0].point)
    edge2.subVectors(triangle[2].point, triangle[0].point)
    normal.crossVectors(edge1, edge2).normalize()

    const height = centroid.length() - R
    const upright = normal.dot(centroid.clone().normalize()) // 1 = flat, small = cliff
    const hash = Math.sin(index * 12.9898 + island.seed) * 43758.5453
    const jitter = 0.93 + 0.14 * (hash - Math.floor(hash)) // +-7% brightness per triangle
    if (height < 0.12) tint.copy(colours.sand)
    else if (upright < 0.8) tint.copy(index % 2 ? colours.cliff : colours.cliffDark)
    else tint.copy(colours.top)
    tint.multiplyScalar(jitter)
    for (let v = 0; v < 3; v++) colors.push(tint.r, tint.g, tint.b)
  })

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()

  const mesh = new Mesh(geometry, new MeshStandardNodeMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 }))
  mesh.name = island.name

  return { mesh, pointAt, centre: grid[0][0], outer }
}
