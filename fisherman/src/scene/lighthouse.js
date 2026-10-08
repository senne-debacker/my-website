import {
  Group, Mesh, CylinderGeometry, ConeGeometry, MeshStandardNodeMaterial, SpotLight, Vector3,
} from 'three/webgpu'
import { WORLD_PALETTE as P, LIGHTHOUSE as L } from '../config.js'
import { createLightCone } from '../tsl/lightCone.js'

// Striped lighthouse, base at y = 0, pointing up. The lantern holds a SpotLight and
// two light cones (opposite each other) that sweep round; they switch on with
// `darkness` (0 = day, 1 = night). Place it with root.position / root.quaternion.

const material = (color, extra = {}) => new MeshStandardNodeMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra })

export function createLighthouse() {
  const root = new Group()
  root.name = 'lighthouse'

  let y = -0.1 // sunk a little so it never floats above uneven ground
  const stack = (radiusTop, radiusBottom, height, mat, segments = 8) => {
    const mesh = new Mesh(new CylinderGeometry(radiusTop, radiusBottom, height, segments), mat)
    mesh.position.y = y + height / 2
    y += height
    root.add(mesh)
    return mesh
  }

  stack(0.26, 0.3, 0.22, material(P.gallery)) // plinth
  const stripes = [material(P.lighthouseRed), material(P.lighthouseWhite)]
  const radii = [0.2, 0.185, 0.17, 0.155, 0.14, 0.125]
  for (let i = 0; i < 5; i++) stack(radii[i + 1], radii[i], 0.32, stripes[i % 2]) // tapered, red/white
  stack(0.21, 0.2, 0.05, material(P.gallery)) // gallery deck

  const lanternY = y
  const glass = material(P.lanternGlow, { emissive: P.lanternGlow, emissiveIntensity: 0 })
  stack(0.115, 0.115, 0.2, glass)
  stack(0.13, 0.13, 0.03, material(P.gallery))
  const roof = new Mesh(new ConeGeometry(0.17, 0.2, 8), material(P.lighthouseRoof))
  roof.position.y = y + 0.1
  root.add(roof)

  // The sweeping beam.
  const beam = new Group()
  beam.position.y = lanternY + 0.1
  root.add(beam)

  const spot = new SpotLight(L.color, 0, 30, 0.28, 0.5, 2)
  const aim = new Vector3(0, -0.7, -L.beamLength) // slightly downwards, away from the tower
  spot.target.position.copy(aim)
  beam.add(spot, spot.target)

  const cones = [aim, new Vector3(aim.x, aim.y, -aim.z)].map((direction) => {
    const cone = createLightCone({ length: L.beamLength, angle: L.beamAngle, color: L.color, strength: 0.38 })
    cone.mesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), direction.clone().normalize())
    beam.add(cone.mesh)
    return cone
  })

  return {
    root,
    height: y + 0.2, // total height above the base
    update(elapsed, darkness) {
      beam.rotation.y = elapsed * L.beamSpeed
      spot.intensity = L.intensity * darkness
      for (const cone of cones) cone.level.value = darkness
      glass.emissiveIntensity = 0.3 + 3 * darkness
    },
  }
}
