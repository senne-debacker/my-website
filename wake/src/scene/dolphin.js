import {
  Group, Mesh, Matrix4, Quaternion, Vector3, Box3, Color, LatheGeometry, ConeGeometry, RingGeometry, Vector2,
  MeshStandardNodeMaterial, MeshBasicNodeMaterial, DoubleSide,
} from 'three/webgpu'
import { float, vec3, color, positionLocal, sin, smoothstep, mix, uniform } from 'three/tsl'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { PLANET, DOLPHIN } from '../config.js'
import { sampleHeight } from '../physics/waves.js'

const R = PLANET.radius
const DEG = Math.PI / 180
const random = (range) => range[0] + Math.random() * (range[1] - range[0])

// A dolphin that leaps out of the sea near the boat and dives back in. There is no skeleton: the
// model (any static mesh, or the built-in low-poly one) is bent in the vertex shader (a travelling
// wave along the body that grows towards the tail, see `bendNodes`), and the leap itself is a
// parabola over the curved sea that the whole model is turned along.
//
// Model space (after `normalise`): length 1, centred, nose towards -Z (like the boat), up = +Y.

// ---- the model -------------------------------------------------------------------------------

// A low-poly dolphin built from a few primitives, merged into one geometry (nose at -Z).
function proceduralParts() {
  const profile = [ // [position along the body (+0.5 = nose), radius]
    [0.5, 0], [0.47, 0.03], [0.4, 0.048], [0.33, 0.085], [0.2, 0.115], [0.0, 0.12], [-0.2, 0.09], [-0.35, 0.05], [-0.45, 0.025], [-0.5, 0.012],
  ].map(([y, r]) => new Vector2(r, y))
  const body = new LatheGeometry(profile, 8)
  body.rotateX(-Math.PI / 2) // length axis y -> -z, so the nose (y = +0.5) ends up at -z
  body.scale(0.85, 1, 1)

  const parts = [body]
  const add = (geometry, matrix) => parts.push(geometry.applyMatrix4(matrix))
  // dorsal fin: a flattened cone leaning back
  add(new ConeGeometry(0.05, 0.16, 4).scale(0.35, 1, 1.6), new Matrix4().makeRotationX(0.5).setPosition(0, 0.15, 0.04))
  // flippers: flattened cones out to the sides, sloping down and back
  for (const side of [-1, 1]) {
    add(new ConeGeometry(0.035, 0.17, 4).scale(1.5, 1, 0.45).rotateZ(side * 1.9).rotateX(0.4), new Matrix4().setPosition(side * 0.1, -0.06, -0.12))
    // tail flukes: flat horizontal blades at the end of the body
    add(new ConeGeometry(0.035, 0.17, 4).scale(1, 1, 3).rotateZ(side * -1.45).rotateX(-0.25), new Matrix4().setPosition(side * 0.07, 0, 0.5))
  }
  return [{ geometry: mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g))), twoTone: true }]
}

// Prepares a loaded model: every mesh is baked into the model's own space (the node transforms
// are applied to the vertices), the whole thing is turned so the nose points to -Z, centred and
// scaled to length 1. Returns the parts: { geometry, color, map }.
function normalise(root) {
  root.updateMatrixWorld(true)
  const parts = []
  root.traverse((node) => {
    if (!node.isMesh) return
    const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld)
    const material = Array.isArray(node.material) ? node.material[0] : node.material
    parts.push({ geometry, color: material.color?.clone() ?? new Color('#7d8fa0'), map: material.map ?? null })
  })
  const turn = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(...DOLPHIN.nose).normalize(), new Vector3(0, 0, -1)))
  const box = new Box3()
  for (const part of parts) {
    part.geometry.applyMatrix4(turn)
    part.geometry.computeBoundingBox()
    box.union(part.geometry.boundingBox)
  }
  const centre = box.getCenter(new Vector3())
  const scale = 1 / (box.max.z - box.min.z)
  for (const part of parts) {
    part.geometry.translate(-centre.x, -centre.y, -centre.z)
    part.geometry.scale(scale, scale, scale)
  }
  return parts
}

async function loadParts() {
  try {
    const gltf = await new GLTFLoader().loadAsync(new URL(DOLPHIN.model, document.baseURI).href)
    const parts = normalise(gltf.scene)
    if (parts.length) return parts
  } catch {
    /* no model file (or not readable): use the built-in dolphin */
  }
  return proceduralParts()
}

// ---- bending -----------------------------------------------------------------------------------

const back = new Color('#52697c')
const belly = new Color('#e1e8ec')

// One dolphin's materials share a `phase` uniform that the tail beat runs on.
function createMaterial(part, phase, amplitude) {
  const t = positionLocal.z.add(0.5) // 0 at the nose, 1 at the tail
  const beat = sin(phase.sub(t.mul(Math.PI * 2 / DOLPHIN.wag.wavelength / 10))).mul(t.mul(t)).mul(amplitude)
  const material = new MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0, flatShading: true })
  if (part.twoTone) material.side = DoubleSide // the fins are single sheets
  material.positionNode = vec3(positionLocal.x, positionLocal.y.add(beat), positionLocal.z)
  if (part.twoTone) {
    // dark blue-grey on the back, pale belly
    material.colorNode = mix(color(belly), color(back), smoothstep(float(-0.035), float(0.045), positionLocal.y))
  } else {
    material.color = part.color
    material.map = part.map
  }
  return material
}

// ---- the leap ------------------------------------------------------------------------------------

const a = new Vector3()
const b = new Vector3()
const forward = new Vector3()
const right = new Vector3()
const up = new Vector3()
const basis = new Matrix4()
const tangent = new Vector3()

// Where the dolphin is `u` (0..1) of the way through the leap: direction on the sphere, and height
// above the water. The parabola is lifted by `dip`, so it starts and ends below the surface.
function leapPoint(leap, u, dirOut) {
  const angle = (leap.distance * u) / R
  dirOut.copy(leap.start).multiplyScalar(Math.cos(angle)).addScaledVector(leap.tangent, Math.sin(angle))
  const { height, dip } = DOLPHIN
  return (height + dip) * (1 - (2 * u - 1) ** 2) - dip
}

export function createDolphins({ scene, layout, audio }) {
  if (!DOLPHIN.enabled) return { group: null, loaded: false, active: 0, slots: [], update() {}, jumpNow() {} }

  const group = new Group()
  group.name = 'dolphins'
  scene.add(group)

  const slots = []
  const rings = []
  let parts = null // set when the model has loaded
  let wait = random(DOLPHIN.interval)

  // Foam rings where it enters and leaves the water.
  const ringGeometry = new RingGeometry(0.05, 0.1, 20)
  for (let i = 0; i < DOLPHIN.concurrent * 2; i++) {
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide })
    material.colorNode = color(new Color('#f4fbff'))
    const mesh = new Mesh(ringGeometry, material)
    mesh.visible = false
    group.add(mesh)
    rings.push({ mesh, age: Infinity, dir: new Vector3() })
  }

  loadParts().then((loaded) => {
    parts = loaded
    for (let i = 0; i < DOLPHIN.concurrent; i++) {
      const phase = uniform(0)
      const root = new Group()
      root.visible = false
      const body = new Group()
      body.scale.setScalar(DOLPHIN.length)
      for (const part of parts) body.add(new Mesh(part.geometry, createMaterial(part, phase, DOLPHIN.wag.amplitude)))
      root.add(body)
      group.add(root)
      slots.push({ root, phase, leap: null, u: 0, splashed: [false, false] })
    }
  })

  const clearOfLand = (dir, margin) => layout.colliders.every((c) => Math.acos(Math.min(1, Math.max(-1, dir.dot(c.dir)))) * R > c.reach + margin)

  // Picks a leap near the boat, in open water. Returns null after a few failed tries.
  function pickLeap(boat) {
    for (let tries = 0; tries < 8; tries++) {
      const side = Math.random() < 0.5 ? -1 : 1
      const bearing = side * random(DOLPHIN.spawn.bearing) * DEG
      const distance = random(DOLPHIN.spawn.distance)
      // a point `distance` away from the boat, `bearing` off its bow
      forward.copy(boat.heading).addScaledVector(boat.dir, -boat.heading.dot(boat.dir)).normalize()
      right.copy(forward).cross(boat.dir).negate() // starboard
      tangent.copy(forward).multiplyScalar(Math.cos(bearing)).addScaledVector(right, Math.sin(bearing))
      const arc = distance / R
      const start = boat.dir.clone().multiplyScalar(Math.cos(arc)).addScaledVector(tangent, Math.sin(arc)).normalize()
      // it leaps across the boat's way, one side to the other
      const across = forward.clone().applyAxisAngle(start, -side * random([55, 115]) * DEG)
      across.addScaledVector(start, -across.dot(start)).normalize()
      const leap = { start, tangent: across, distance: DOLPHIN.distance }
      const probe = new Vector3()
      let clear = true
      for (const u of [0, 0.25, 0.5, 0.75, 1]) {
        leapPoint(leap, u, probe)
        if (!clearOfLand(probe, 0.6)) clear = false
      }
      if (clear) return leap
    }
    return null
  }

  let space = 0 // 0 = chase view, 1 = planet view (set every frame): the splash sounds muffled from out there

  function splash(index, dir, distanceToBoat) {
    const ring = rings.find((r) => r.age > DOLPHIN.splash.seconds)
    if (ring) {
      ring.age = 0
      ring.dir.copy(dir)
    }
    audio?.splash((1 / (1 + distanceToBoat * 0.5)) * (1 - 0.75 * space))
  }

  return {
    group,
    get loaded() {
      return parts !== null
    },

    // `playing`: the game runs (no new jumps otherwise). They also happen in planet view.
    update(delta, elapsed, boat, storm, playing, spaceAmount = 0) {
      if (!parts) return
      space = spaceAmount

      if (playing && storm < DOLPHIN.maxStorm) wait -= delta
      const free = slots.find((s) => !s.leap)
      if (wait <= 0 && free) {
        wait = random(DOLPHIN.interval)
        free.leap = pickLeap(boat)
        free.u = 0
        free.splashed = [false, false]
      }

      for (const slot of slots) {
        if (!slot.leap) continue
        slot.u += delta / DOLPHIN.duration
        if (slot.u >= 1) {
          slot.leap = null
          slot.root.visible = false
          continue
        }
        slot.root.visible = true
        slot.phase.value = elapsed * DOLPHIN.wag.speed

        // position and heading from the leap curve: two close points give the direction of travel
        const dir = a
        const h1 = leapPoint(slot.leap, slot.u, dir)
        const surface1 = sampleHeight(dir, elapsed, storm)
        slot.root.position.copy(dir).multiplyScalar(R + surface1 + h1)
        const next = b
        const h2 = leapPoint(slot.leap, Math.min(1, slot.u + 0.02), next)
        const p2 = next.clone().multiplyScalar(R + sampleHeight(next, elapsed, storm) + h2)
        forward.copy(p2).sub(slot.root.position).normalize()
        up.copy(dir)
        right.crossVectors(forward, up).normalize()
        up.crossVectors(right, forward)
        basis.makeBasis(right, up, forward.clone().negate()) // the nose is -Z
        slot.root.quaternion.setFromRotationMatrix(basis)

        // splashes where it crosses the surface
        const crossing = Math.sqrt(1 - DOLPHIN.dip / (DOLPHIN.height + DOLPHIN.dip))
        const marks = [(1 - crossing) / 2, (1 + crossing) / 2]
        marks.forEach((mark, index) => {
          if (!slot.splashed[index] && slot.u >= mark) {
            slot.splashed[index] = true
            leapPoint(slot.leap, mark, tangent)
            splash(index, tangent, Math.acos(Math.min(1, tangent.dot(boat.dir))) * R)
          }
        })
      }

      for (const ring of rings) {
        ring.age += delta
        const k = ring.age / DOLPHIN.splash.seconds
        ring.mesh.visible = k < 1
        if (k >= 1) continue
        ring.mesh.position.copy(ring.dir).multiplyScalar(R + sampleHeight(ring.dir, elapsed, storm) + 0.03)
        ring.mesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), ring.dir)
        ring.mesh.scale.setScalar(1 + (DOLPHIN.splash.size - 1) * Math.sqrt(k))
        ring.mesh.material.opacity = 0.8 * (1 - k) ** 1.5
      }
    },

    // Dev: start a leap now.
    jumpNow() {
      wait = 0
    },
    get active() {
      return slots.filter((s) => s.leap).length
    },
    slots,
  }
}
