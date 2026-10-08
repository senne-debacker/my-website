import {
  Group, Mesh, CylinderGeometry, ConeGeometry, SphereGeometry, MeshStandardNodeMaterial,
} from 'three/webgpu'
import { WORLD_PALETTE as P } from '../config.js'
import { createBoatState, createBoatPose, computeBoatPose } from '../physics/boat.js'

// Navigation buoys. They float exactly like the boat (same CPU wave function and
// plane fit, just a smaller footprint) and blink at night.

const FOOTPRINT = { sampleHalfLength: 0.09, sampleHalfWidth: 0.09 }
const material = (color, extra = {}) => new MeshStandardNodeMaterial({ color, roughness: 0.8, metalness: 0, flatShading: true, ...extra })

function createBuoyModel() {
  const root = new Group()
  const part = (geometry, mat, y) => {
    const mesh = new Mesh(geometry, mat)
    mesh.position.y = y
    root.add(mesh)
    return mesh
  }
  part(new CylinderGeometry(0.1, 0.11, 0.14, 7), material(P.buoyRed), 0.0)
  part(new CylinderGeometry(0.085, 0.1, 0.1, 7), material(P.buoyWhite), 0.12)
  part(new ConeGeometry(0.085, 0.14, 7), material(P.buoyRed), 0.24)
  part(new CylinderGeometry(0.012, 0.012, 0.24, 5), material(P.gallery), 0.4)
  const lamp = new MeshStandardNodeMaterial({ color: P.buoyLamp, emissive: P.buoyLamp, emissiveIntensity: 0, roughness: 0.4, flatShading: true })
  part(new SphereGeometry(0.04, 6, 4), lamp, 0.55)
  return { root, lamp }
}

export function createBuoys(buoyList) {
  const group = new Group()
  group.name = 'buoys'

  const buoys = buoyList.map((entry, index) => {
    const model = createBuoyModel()
    group.add(model.root)
    return { ...model, state: createBoatState(entry.dir, entry.heading), pose: createBoatPose(), phase: index * 1.7 }
  })

  return {
    group,
    update(elapsed, storm, darkness) {
      for (const buoy of buoys) {
        computeBoatPose(buoy.state, elapsed, storm, buoy.pose, FOOTPRINT)
        buoy.root.position.copy(buoy.pose.position)
        buoy.root.quaternion.copy(buoy.pose.quaternion)
        // Blink: a short flash about once per two seconds, each buoy out of step.
        const flash = Math.max(0, Math.sin(elapsed * 3 + buoy.phase)) ** 6
        buoy.lamp.emissiveIntensity = darkness * (0.4 + 3.5 * flash)
      }
    },
  }
}
