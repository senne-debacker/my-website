import {
  Group, Mesh, Shape, ExtrudeGeometry, BoxGeometry, CylinderGeometry, ConeGeometry, TorusGeometry,
  ShapeGeometry, DoubleSide, MeshStandardNodeMaterial, SpotLight, Vector3, Box3, Color,
} from 'three/webgpu'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { BOAT, BOAT_PALETTE as C, BOAT_LIGHT as L } from '../config.js'
import { createLightCone } from '../tsl/lightCone.js'

// Low-poly fishing boat: built in code, or your own model from public/models/boat.glb (see
// `loadBoatModel` below and public/models/README.txt) when that file exists.
// Procedural low-poly fishing boat. Local axes: +Y up, bow towards -Z, origin on
// the waterline in the middle of the hull. Physics (physics/boat.js) moves and
// orients the returned `root`. `update(delta, lightsOn)` fades the bow lamp
// (SpotLight, glowing lamp + windows, light cone) in and out.

const material = (color, roughness = 0.85, extra = {}) =>
  new MeshStandardNodeMaterial({ color, roughness, metalness: 0, flatShading: true, ...extra })

// Gives a mesh and its material the same name (the names end up in the exported .glb and in Blender).
const named = (mesh, name) => {
  mesh.name = name
  mesh.material.name = name
  return mesh
}

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
  const look = new Group() // everything you see of the hull and fittings (swapped for a loaded model)
  look.name = 'boat-model'
  model.add(look)

  const sternZ = 0.12 // wheelhouse sits towards the stern
  const gunwale = 0.14

  // Hull: dark lower part (under the waterline) and red upper part.
  look.add(named(slab(hullOutline(0.82), -0.12, 0.12, C.hullBottom), 'Hull_Bottom'))
  look.add(named(slab(hullOutline(1), 0, gunwale, C.hullTop), 'Hull_Top'))
  look.add(named(slab(hullOutline(0.9), gunwale, 0.02, C.deck), 'Deck'))

  // Wheelhouse.
  const deck = gunwale + 0.02
  look.add(named(box(0.28, 0.3, 0.3, C.cabin, 0, deck + 0.15, sternZ), 'Cabin'))
  look.add(named(box(0.34, 0.04, 0.38, C.roof, 0, deck + 0.32, sternZ), 'Roof'))
  const windows = material(C.window, 0.4, { emissive: L.windowGlow, emissiveIntensity: 0 })
  windows.name = 'Window'
  look.add(Object.assign(box(0.2, 0.1, 0.01, C.window, 0, deck + 0.2, sternZ - 0.15, windows), { name: 'Window' }))
  look.add(Object.assign(box(0.01, 0.1, 0.16, C.window, 0.14, deck + 0.2, sternZ, windows), { name: 'Window' }))
  look.add(Object.assign(box(0.01, 0.1, 0.16, C.window, -0.14, deck + 0.2, sternZ, windows), { name: 'Window' }))

  // Horn: a brass bell on the front of the wheelhouse roof, pointing forward. It shakes while it sounds.
  const brass = material(C.horn, 0.35, { metalness: 0.6 })
  brass.name = 'Horn'
  const hornGroup = new Group()
  hornGroup.name = 'Horn'
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
  stem.name = 'Horn_Stem'
  bell.name = 'Bell'
  throat.name = 'Horn_Throat'
  hornGroup.add(stem, bell, throat)
  look.add(hornGroup)

  // Mast with a pennant (it points backwards, like a flag in the wind of travel).
  const mast = named(new Mesh(new CylinderGeometry(0.012, 0.016, 0.5, 5), material(C.metal)), 'Mast')
  mast.position.set(0, deck + 0.34 + 0.25, sternZ)
  look.add(mast)

  const pennant = new Shape()
  pennant.moveTo(0, 0.05)
  pennant.lineTo(0.18, 0.05)
  pennant.lineTo(0.14, 0)
  pennant.lineTo(0.18, -0.05)
  pennant.lineTo(0, -0.05)
  pennant.closePath()
  const flagGeometry = new ShapeGeometry(pennant)
  flagGeometry.rotateY(-Math.PI / 2) // shape +x -> world +z (stern)
  const flag = named(new Mesh(flagGeometry, material(C.flag, 0.9, { side: DoubleSide })), 'Flag')
  flag.position.set(0, deck + 0.34 + 0.45, sternZ)
  look.add(flag)

  // Deck clutter: a crate in front of the wheelhouse and two posts on the stern.
  look.add(named(box(0.15, 0.1, 0.15, C.crate, 0.02, deck + 0.05, -0.17), 'Crate'))
  for (const x of [-0.14, 0.14]) {
    const post = named(new Mesh(new CylinderGeometry(0.016, 0.016, 0.14, 5), material(C.metal)), 'Post')
    post.position.set(x, deck + 0.07, BOAT.length / 2 - 0.04)
    look.add(post)
  }

  // Tyre fenders along both sides.
  for (const x of [-1, 1]) {
    for (const z of [0.02, 0.28]) {
      const tire = named(new Mesh(new TorusGeometry(0.045, 0.022, 5, 8), material(C.tire, 0.95)), 'Tyre')
      tire.rotation.y = Math.PI / 2 // ring faces sideways
      tire.position.set(x * (BOAT.width / 2 + 0.012), 0.08, z)
      look.add(tire)
    }
  }

  // --- Bow lamp -----------------------------------------------------------------
  const [lx, ly, lz] = L.lampPosition
  const lampGlass = material('#fff1c9', 0.3, { emissive: '#ffe3ae', emissiveIntensity: 0 })
  look.add(named(box(0.08, 0.07, 0.07, C.metal, lx, ly, lz), 'Bow_Lamp_Housing'))
  look.add(named(box(0.06, 0.05, 0.01, '#fff1c9', lx, ly, lz - 0.04, lampGlass), 'Lamp'))

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

  // What update() animates. For the built-in boat: the horn, the horn bell and the glowing
  // materials. For a loaded model the same roles are found by name (see loadBoatModel).
  const parts = { horn: hornGroup, bell, glow: [{ material: lampGlass, strength: 0.4 }, { material: windows, strength: 0.45 }] }

  // Resolves when the model file (if there is one) has replaced the built-in boat.
  const ready = loadBoatModel().then((loaded) => {
    if (!loaded) return false
    model.remove(look)
    model.add(loaded.root)
    parts.horn = loaded.horn
    parts.bell = loaded.bell
    parts.glow = loaded.glow
    return true
  })

  return {
    root,
    get lampLevel() {
      return level // 0..1, how far the lamp has faded on
    },
    model,
    ready,
    update(delta, lightsOn, hornOn = false, time = 0) {
      hornLevel += ((hornOn ? 1 : 0) - hornLevel) * (1 - Math.exp(-delta * 18))
      parts.bell?.scale.setScalar(1 + 0.1 * hornLevel * Math.sin(time * 75)) // the bell trembles while it sounds
      if (parts.horn) parts.horn.rotation.z = 0.025 * hornLevel * Math.sin(time * 61)
      level += ((lightsOn ? 1 : 0) - level) * (1 - Math.exp(-delta * 6))
      spot.intensity = L.intensity * level
      cone.level.value = level
      for (const { material, strength } of parts.glow) material.emissiveIntensity = strength * level
    },
  }
}

// ---- your own model ---------------------------------------------------------------------------

// Loads public/models/boat.glb if there is one (see public/models/README.txt for how to make it in
// Blender). The model is used as it is, except that it is scaled to the hull length `BOAT.length`
// (so the physics, the collisions and the camera keep fitting) when BOAT.model.fitLength is on.
// Roles are found by name:
//   a node whose name starts with "Horn"      trembles while the horn sounds (its child named
//                                             "Bell..." grows and shrinks)
//   materials named "Window..." and "Lamp..."  glow when the lamp is on (their emissive colour is
//                                             used; without one the base colour / a warm white is)
// Returns null when there is no file.
async function loadBoatModel() {
  let gltf
  try {
    gltf = await new GLTFLoader().loadAsync(new URL(BOAT.model.file, document.baseURI).href)
  } catch {
    return null // no model file: keep the built-in boat
  }
  const root = gltf.scene
  root.name = 'boat-model'

  if (BOAT.model.fitLength) {
    const box = new Box3().setFromObject(root)
    const length = box.max.z - box.min.z
    if (length > 0) root.scale.multiplyScalar(BOAT.length / length)
  }

  let horn = null
  let bell = null
  const glow = []
  const seen = new Set()
  root.traverse((node) => {
    if (/^horn/i.test(node.name) && !horn) horn = node
    if (/^bell/i.test(node.name) && !bell) bell = node
    if (!node.isMesh) return
    for (const material of [node.material].flat()) {
      if (BOAT.model.flat) material.flatShading = true
      if (seen.has(material)) continue
      seen.add(material)
      const kind = /^(window|lamp)/i.test(material.name) ? material.name.toLowerCase() : null
      if (!kind) continue
      if (!material.emissive || material.emissive.getHex() === 0) {
        material.emissive = new Color(kind.startsWith('lamp') ? '#ffe3ae' : L.windowGlow)
      }
      material.emissiveIntensity = 0
      glow.push({ material, strength: kind.startsWith('lamp') ? 0.4 : 0.45 })
    }
  })
  return { root, horn, bell, glow }
}
