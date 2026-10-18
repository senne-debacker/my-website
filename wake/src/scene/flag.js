import { Group, MeshStandardNodeMaterial, DoubleSide } from 'three/webgpu'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { float, uniform, vec3, positionLocal, sin } from 'three/tsl'
import { FLAG } from '../config.js'

const TAU = Math.PI * 2
const wrap = (angle) => ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI

// Makes the boat's flag flutter and turn with the wind. Works on the built-in pennant and on the flag
// of your own model: it is the mesh named "Flag..." or with a material named "Flag...". What it does:
//   * the flag's few triangles are cut into many small ones (TessellateModifier), so that it can bend
//   * the flag is moved into a pivot at the end that sits on the mast (the end with the taller edge),
//     so that it can swing round the mast (`update` turns the pivot)
//   * its material gets a TSL vertex shader (positionNode): a wave runs along the flag from the mast
//     to the free end, with a second, faster one on top, growing towards the tip (the mast end stays
//     put); the amplitude and the speed follow the wind strength
// Assumes the flag lies roughly flat in a vertical plane, longer than tall, like a pennant, and that the
// nodes above it have no transforms of their own (true for models exported with applied transforms).
// Returns { update(delta, windAngle, strength) } or null when there is no flag.
//   windAngle: the way the wind blows, relative to the bow, radians clockwise (0 = towards the bow)
export function setupFlag(root) {
  let mesh = null
  root.traverse((node) => {
    if (!mesh && node.isMesh && (/^flag/i.test(node.name) || /^flag/i.test([node.material].flat()[0]?.name ?? ''))) mesh = node
  })
  if (!mesh) return null

  // The flag's geometry in its parent's space, cut into small triangles.
  mesh.updateMatrix()
  let geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix)
  if (geometry.index) geometry = geometry.toNonIndexed()
  geometry.computeBoundingBox()
  const box = geometry.boundingBox
  const extent = { x: box.max.x - box.min.x, z: box.max.z - box.min.z }
  const alongX = extent.x > extent.z // the flag's length is along the longer of the two horizontal axes
  const axis = alongX ? 'x' : 'z'
  const length = extent[axis]
  if (!(length > 1e-6)) return null
  geometry = new TessellateModifier(length / FLAG.cuts, 8).modify(geometry)
  geometry.computeVertexNormals()

  // Which end is on the mast: the one where the flag is taller.
  const position = geometry.attributes.position
  const band = length * 0.2
  const tall = { low: [Infinity, -Infinity], high: [Infinity, -Infinity] }
  for (let i = 0; i < position.count; i++) {
    const a = position.getComponent(i, alongX ? 0 : 2)
    const y = position.getY(i)
    const end = a < box.min[axis] + band ? tall.low : a > box.max[axis] - band ? tall.high : null
    if (end) {
      end[0] = Math.min(end[0], y)
      end[1] = Math.max(end[1], y)
    }
  }
  const lowIsMast = tall.low[1] - tall.low[0] >= tall.high[1] - tall.high[0]
  const mastAt = lowIsMast ? box.min[axis] : box.max[axis]
  const sign = lowIsMast ? 1 : -1 // from the mast towards the free end, along the axis
  const attach = { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 }
  attach[axis] = mastAt

  geometry.translate(-attach.x, -attach.y, -attach.z) // the pivot is on the mast, in the middle of the flag's height
  const direction = alongX ? [sign, 0, 0] : [0, 0, sign]
  const restAngle = Math.atan2(direction[0], -direction[2]) // the way the flag points now, clockwise from the bow

  // Shader: the wave.
  const strength = uniform(0.4)
  const phase = uniform(0)
  const dir = vec3(direction[0], 0, direction[2])
  const side = vec3(-direction[2], 0, direction[0])
  const u = positionLocal.dot(dir).div(length).clamp(0, 1) // 0 at the mast, 1 at the tip
  const grow = u.pow(1.4)
  const amplitude = strength.mul(0.65).add(0.35).mul(length * FLAG.amplitude)
  const k = FLAG.waves * TAU
  const wave = sin(u.mul(k).sub(phase)).add(sin(u.mul(k * 1.9).sub(phase.mul(1.35)).add(1.7)).mul(0.35))
  const lift = sin(u.mul(k * 1.3).sub(phase.mul(1.1))).mul(0.4)
  const material = new MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0, flatShading: true, side: DoubleSide })
  const old = [mesh.material].flat()[0]
  if (old.color) material.color.copy(old.color)
  if (old.map) material.map = old.map
  material.name = old.name
  material.positionNode = positionLocal.add(side.mul(wave.mul(amplitude).mul(grow))).add(vec3(0, 1, 0).mul(lift.mul(amplitude).mul(grow)))

  const pivot = new Group()
  pivot.name = 'flag-pivot'
  pivot.position.set(attach.x, attach.y, attach.z)
  const parent = mesh.parent
  mesh.removeFromParent()
  mesh.geometry = geometry
  mesh.material = material
  mesh.position.set(0, 0, 0)
  mesh.quaternion.identity()
  mesh.scale.set(1, 1, 1)
  mesh.frustumCulled = false // the bending is not in the bounding box
  pivot.add(mesh)
  parent.add(pivot)

  let angle = restAngle // where the pivot is turned to, as the heading of the flag
  let started = false
  return {
    pivot,
    // `windAngle`: the way the wind blows relative to the bow, radians clockwise. The flag streams
    // downwind, so it turns to point that way (and swings round when the boat turns).
    update(delta, windAngle, windStrength) {
      if (!started) {
        angle = windAngle
        started = true
      }
      angle += wrap(windAngle - angle) * (1 - Math.exp(-delta * FLAG.turnRate))
      pivot.rotation.y = restAngle - angle // turning by t about +Y lowers the clockwise heading by t
      strength.value = windStrength
      phase.value += delta * (FLAG.speed[0] + (FLAG.speed[1] - FLAG.speed[0]) * windStrength)
    },
  }
}
