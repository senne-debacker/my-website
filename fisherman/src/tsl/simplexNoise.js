// TSL port of the 3D simplex noise fragment shader from Shadertoy:
//   https://www.shadertoy.com/view/XsX3zB
//
// Original shader: Copyright (c) 2013 Nikita Miropolskiy, MIT License
// (see the "Third-party code" section of the README for the licence text).
//
// Each TSL statement is annotated with the GLSL line it replaces. The only
// deliberate deviation is `random3`, see the note above it.

import {
  Fn, float, vec3, vec4, uint, uvec3, ivec3,
  floor, dot, step, max,
} from 'three/tsl'
import { F3, G3, FRACTAL_WEIGHTS, ROT1, ROT2, ROT3 } from '../noiseConstants.js'

// --- random3 ---------------------------------------------------------------
// GLSL (original):
//   vec3 random3(vec3 c) {
//     float j = 4096.0*sin(dot(c, vec3(17.0, 59.4, 15.0)));
//     vec3 r; r.z = fract(512.0*j); j *= .125; r.x = fract(512.0*j);
//     j *= .125; r.y = fract(512.0*j);
//     return r - 0.5;
//   }
//
// The original hashes with `sin(...) * 4096`. That is chaotic: float32 on the
// GPU and float64 in JS give completely different gradients, so a CPU copy of
// the noise (needed for the boat to float on the waves) would never match.
// We keep the contract (lattice corner in, pseudo-random vec3 in [-0.5, 0.5)
// out) but compute it with an integer PCG hash, which is bit-identical in WGSL
// and in JavaScript (Math.imul).
const pcg3d = Fn(([vIn]) => {
  const v = vIn.toVar()
  v.assign(v.mul(uint(1664525)).add(uint(1013904223)))
  v.x.addAssign(v.y.mul(v.z))
  v.y.addAssign(v.z.mul(v.x))
  v.z.addAssign(v.x.mul(v.y))
  v.assign(v.bitXor(v.shiftRight(uvec3(16))))
  v.x.addAssign(v.y.mul(v.z))
  v.y.addAssign(v.z.mul(v.x))
  v.z.addAssign(v.x.mul(v.y))
  return v
})

export const random3 = Fn(([c]) => {
  // c is integer-valued (floor() output), so float -> int is exact.
  const h = pcg3d(uvec3(ivec3(c)))
  // Keep the top 24 bits: exactly representable in float32, so GPU == CPU.
  return vec3(h.shiftRight(uvec3(8))).mul(1 / 16777216).sub(0.5)
})

// --- simplex3d -------------------------------------------------------------
// GLSL: float simplex3d(vec3 p)
export const simplex3d = Fn(([p]) => {
  // vec3 s = floor(p + dot(p, vec3(F3)));        skew into simplex space
  const s = floor(p.add(dot(p, vec3(F3)))).toVar()
  // vec3 x = p - s + dot(s, vec3(G3));           unskew: offset from cell origin
  const x = p.sub(s).add(dot(s, vec3(G3))).toVar()

  // Which of the 6 tetrahedra of the cube are we in?
  // vec3 e  = step(vec3(0.0), x - x.yzx);
  const e = step(vec3(0), x.sub(x.yzx)).toVar()
  // vec3 i1 = e*(1.0 - e.zxy);
  const i1 = e.mul(vec3(1).sub(e.zxy)).toVar()
  // vec3 i2 = 1.0 - e.zxy*(1.0 - e);
  const i2 = vec3(1).sub(e.zxy.mul(vec3(1).sub(e))).toVar()

  // Offsets to the other three corners of the tetrahedron.
  // vec3 x1 = x - i1 + G3;
  const x1 = x.sub(i1).add(G3).toVar()
  // vec3 x2 = x - i2 + 2.0*G3;
  const x2 = x.sub(i2).add(2 * G3).toVar()
  // vec3 x3 = x - 1.0 + 3.0*G3;
  const x3 = x.sub(1).add(3 * G3).toVar()

  // Radial falloff per corner.
  // vec4 w; w.x = dot(x,x); w.y = dot(x1,x1); w.z = dot(x2,x2); w.w = dot(x3,x3);
  // w = max(0.6 - w, 0.0);
  const w = max(vec4(0.6).sub(vec4(dot(x, x), dot(x1, x1), dot(x2, x2), dot(x3, x3))), 0).toVar()

  // Gradient contribution per corner.
  // d.x = dot(random3(s),        x);   d.y = dot(random3(s + i1), x1);
  // d.z = dot(random3(s + i2),  x2);   d.w = dot(random3(s + 1.0), x3);
  const d = vec4(
    dot(random3(s), x),
    dot(random3(s.add(i1)), x1),
    dot(random3(s.add(i2)), x2),
    dot(random3(s.add(1)), x3),
  ).toVar()

  // w *= w; w *= w;  -> (0.6 - r^2)^4
  const w2 = w.mul(w)
  const w4 = w2.mul(w2)

  // return dot(d * w, vec4(52.0));
  return dot(d.mul(w4), vec4(52))
})

// GLSL: m * rotN, a row vector times a column-major mat3 = one dot per column.
const rotate = (m, [c0, c1, c2]) => vec3(dot(m, vec3(...c0)), dot(m, vec3(...c1)), dot(m, vec3(...c2)))

// GLSL: float simplex3d_fractal(vec3 m)   (4 octaves, weights sum to 1)
//   0.5333333*simplex3d(m*rot1) + 0.2666667*simplex3d(2.0*m*rot2)
//   + 0.1333333*simplex3d(4.0*m*rot3) + 0.0666667*simplex3d(8.0*m)
export const simplex3dFractal = Fn(([m]) => {
  const [w1, w2, w3, w4] = FRACTAL_WEIGHTS
  return float(w1).mul(simplex3d(rotate(m, ROT1)))
    .add(float(w2).mul(simplex3d(rotate(m.mul(2), ROT2))))
    .add(float(w3).mul(simplex3d(rotate(m.mul(4), ROT3))))
    .add(float(w4).mul(simplex3d(m.mul(8))))
})
