import {
  Float32BufferAttribute, CylinderGeometry, ConeGeometry, IcosahedronGeometry, Color,
} from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { WORLD_PALETTE as P } from '../config.js'

// Geometry for the things scattered over the islands. Each is one merged,
// non-indexed mesh with baked vertex colours, so a whole forest is one draw call.

// Make a geometry non-indexed and paint it a single colour.
function painted(geometry, hex) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry
  const color = new Color(hex)
  const values = new Float32Array(g.attributes.position.count * 3)
  for (let i = 0; i < values.length; i += 3) values.set([color.r, color.g, color.b], i)
  g.setAttribute('color', new Float32BufferAttribute(values, 3))
  return g
}

// Base at y = 0, pointing up.
export function createPineGeometry() {
  return mergeGeometries([
    painted(new CylinderGeometry(0.03, 0.04, 0.16, 5).translate(0, 0.06, 0), P.trunk),
    painted(new ConeGeometry(0.2, 0.3, 6).translate(0, 0.28, 0), P.pine),
    painted(new ConeGeometry(0.16, 0.26, 6).translate(0, 0.46, 0), P.pineLight),
    painted(new ConeGeometry(0.11, 0.22, 6).translate(0, 0.62, 0), P.pine),
  ])
}

export function createAutumnTreeGeometry() {
  const crown = new IcosahedronGeometry(0.2, 0).scale(1, 0.85, 1).translate(0, 0.36, 0)
  return mergeGeometries([
    painted(new CylinderGeometry(0.025, 0.035, 0.22, 5).translate(0, 0.09, 0), P.trunk),
    painted(crown, P.autumnLeaves[0]), // instances tint it towards the other autumn colours
  ])
}

// Unit rock; instances scale it.
export function createRockGeometry() {
  return painted(new IcosahedronGeometry(1, 0), P.rock)
}
