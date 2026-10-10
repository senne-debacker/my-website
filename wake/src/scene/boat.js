import {
  Group, Mesh, Shape, ExtrudeGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry,
  ShapeGeometry, DoubleSide, MeshStandardNodeMaterial, SpotLight, Vector3,
} from 'three/webgpu'
import { BOAT, BOAT_PALETTE as C, BOAT_LIGHT as L } from '../config.js'
import { createLightCone } from '../tsl/lightCone.js'

// Procedural low-poly fishing boat. Local axes: +Y up, bow towards -Z, origin on
// the waterline in the middle of the hull. Physics (physics/boat.js) moves and
// orients the returned `root`. `update(delta, lightsOn)` fades the bow lamp
// (SpotLight, glowing lamp + windows, light cone) in and out.

const material = (color, roughness = 0.85, extra = {}) =>
  new MeshStandardNodeMaterial({ color, roughness, metalness: 0, flatShading: true, ...extra })

function box(w, h, d, color, x, y, z, mat = material(color)) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), mat)
  mesh.position.set(x, y, z)
  return mesh
}

// Top-view hull outline (x across, y along the keel with the bow at +y).
function hullOutline(scale) {
  const hw = (BOAT.width / 2) * scale
  const hl = (BOAT.length / 2) * scale
  const shape = new Shape()
  shape.moveTo(0, hl)
  shape.lineTo(hw * 0.7, hl * 0.55)
  shape.lineTo(hw, hl * 0.1)
  shape.lineTo(hw, -hl)
  shape.lineTo(-hw, -hl)
  shape.lineTo(-hw, hl * 0.1)
  shape.lineTo(-hw * 0.7, hl * 0.55)
  shape.closePath()
  return shape
}

// Extrude an outline upwards from y = `bottom`. rotateX(-90deg) maps the shape's
// +y (bow) to world -z and the extrusion depth to +y.
function slab(outline, bottom, height, color) {
  const geometry = new ExtrudeGeometry(outline, { depth: height, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, bottom, 0)
  return new Mesh(geometry, material(color))
}

export function createBoat() {
  const root = new Group()
  root.name = 'boat'
  const model = new Group()
  model.position.y = BOAT.rideHeight
  root.add(model)

  const sternZ = 0.12 // wheelhouse sits towards the stern
  const gunwale = 0.14

  // Hull: dark lower part (under the waterline) and red upper part.
  model.add(slab(hullOutline(0.82), -0.12, 0.12, C.hullBottom))
  model.add(slab(hullOutline(1), 0, gunwale, C.hullTop))
  model.add(slab(hullOutline(0.9), gunwale, 0.02, C.deck))

  // Wheelhouse.
  const deck = gunwale + 0.02
  model.add(box(0.28, 0.3, 0.3, C.cabin, 0, deck + 0.15, sternZ))
  model.add(box(0.34, 0.04, 0.38, C.roof, 0, deck + 0.32, sternZ))
  const windows = material(C.window, 0.4, { emissive: L.windowGlow, emissiveIntensity: 0 })
  model.add(box(0.2, 0.1, 0.01, C.window, 0, deck + 0.2, sternZ - 0.15, windows))
  model.add(box(0.01, 0.1, 0.16, C.window, 0.14, deck + 0.2, sternZ, windows))
  model.add(box(0.01, 0.1, 0.16, C.window, -0.14, deck + 0.2, sternZ, windows))

  // Horn: a brass bell on the front of the wheelhouse roof, pointing forward. It shakes while it sounds.
  const brass = material(C.horn, 0.35, { metalness: 0.6 })
  const hornGroup = new Group()
  hornGroup.position.set(0.09, deck + 0.34 + 0.045, sternZ - 0.13)
  const stem = new Mesh(new CylinderGeometry(0.014, 0.018, 0.05, 6), brass)
  stem.position.y = -0.03
  const bell = new Mesh(new ConeGeometry(0.052, 0.13, 8, 1, true), brass)
  bell.material.side = DoubleSide
  bell.geometry.rotateX(Math.PI / 2) // apex to the rear, opening forward (-Z)
  bell.position.z = -0.02
  const throat = new Mesh(new CylinderGeometry(0.014, 0.014, 0.07, 6), brass)
  throat.geometry.rotateX(Math.PI / 2)
  throat.position.z = 0.07
  hornGroup.add(stem, bell, throat)
  model.add(hornGroup)

  // Mast with a pennant (it points backwards, like a flag in the wind of travel).
  const mast = new Mesh(new CylinderGeometry(0.012, 0.016, 0.5, 5), material(C.metal))
  mast.position.set(0, deck + 0.34 + 0.25, sternZ)
  model.add(mast)

  const pennant = new Shape()
  pennant.moveTo(0, 0.05)
  pennant.lineTo(0.18, 0.05)
  pennant.lineTo(0.14, 0)
  pennant.lineTo(0.18, -0.05)
  pennant.lineTo(0, -0.05)
  pennant.closePath()
  const flagGeometry = new ShapeGeometry(pennant)
  flagGeometry.rotateY(-Math.PI / 2) // shape +x -> world +z (stern)
  const flag = new Mesh(flagGeometry, material(C.flag, 0.9, { side: DoubleSide }))
  flag.position.set(0, deck + 0.34 + 0.45, sternZ)
  model.add(flag)

  // Deck clutter: a crate in front of the wheelhouse and two posts on the stern.
  model.add(box(0.15, 0.1, 0.15, C.crate, 0.02, deck + 0.05, -0.17))
  for (const x of [-0.14, 0.14]) {
    const post = new Mesh(new CylinderGeometry(0.016, 0.016, 0.14, 5), material(C.metal))
    post.position.set(x, deck + 0.07, BOAT.length / 2 - 0.04)
    model.add(post)
  }

  // Tyre fenders along both sides.
  for (const x of [-1, 1]) {
    for (const z of [0.02, 0.28]) {
      const tire = new Mesh(new TorusGeometry(0.045, 0.022, 5, 8), material(C.tire, 0.95))
      tire.rotation.y = Math.PI / 2 // ring faces sideways
      tire.position.set(x * (BOAT.width / 2 + 0.012), 0.08, z)
      model.add(tire)
    }
  }

  // --- Bow lamp -----------------------------------------------------------------
  const [lx, ly, lz] = L.lampPosition
  const lampGlass = material('#fff1c9', 0.3, { emissive: '#ffe3ae', emissiveIntensity: 0 })
  model.add(box(0.08, 0.07, 0.07, C.metal, lx, ly, lz))
  model.add(box(0.06, 0.05, 0.01, '#fff1c9', lx, ly, lz - 0.04, lampGlass))

  const spot = new SpotLight(L.color, 0, L.distance, L.angle, L.penumbra, L.decay)
  spot.position.set(lx, ly, lz - 0.05)
  spot.target.position.set(...L.aim)
  model.add(spot, spot.target) // the target must live in the scene graph to follow the boat

  const cone = createLightCone({ length: L.coneLength, angle: L.angle, color: L.color, strength: L.coneStrength })
  cone.mesh.position.copy(spot.position)
  cone.mesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), spot.target.position.clone().sub(spot.position).normalize())
  model.add(cone.mesh)

  let level = 0 // 0 = off, 1 = on; eased so the lamp warms up instead of popping
  let hornLevel = 0

  return {
    root,
    get lampLevel() {
      return level // 0..1, how far the lamp has faded on
    },
    model,
    update(delta, lightsOn, hornOn = false, time = 0) {
      hornLevel += ((hornOn ? 1 : 0) - hornLevel) * (1 - Math.exp(-delta * 18))
      bell.scale.setScalar(1 + 0.1 * hornLevel * Math.sin(time * 75)) // the bell trembles while it sounds
      hornGroup.rotation.z = 0.025 * hornLevel * Math.sin(time * 61)
      level += ((lightsOn ? 1 : 0) - level) * (1 - Math.exp(-delta * 6))
      spot.intensity = L.intensity * level
      cone.level.value = level
      lampGlass.emissiveIntensity = 0.4 * level
      windows.emissiveIntensity = 0.45 * level
    },
  }
}
