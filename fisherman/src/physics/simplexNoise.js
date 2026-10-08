// CPU twin of src/tsl/simplexNoise.js. Same algorithm, same constants, same
// integer hash, so the boat can sample the exact waves the GPU draws.
// Keep the two files in sync; src/debug/parityTest.js checks them against each other.
//
// Original shader: Copyright (c) 2013 Nikita Miropolskiy, MIT License,
// https://www.shadertoy.com/view/XsX3zB

import { F3, G3, FRACTAL_WEIGHTS, ROT1, ROT2, ROT3 } from '../noiseConstants.js'

const step = (edge, x) => (x < edge ? 0 : 1)

// Integer PCG hash. int32 arithmetic with `| 0` and Math.imul has exactly the
// same bit patterns as the u32 arithmetic in WGSL; `>>>` is the unsigned shift.
// Writes a pseudo-random vector in [-0.5, 0.5) into `out`.
export function random3(cx, cy, cz, out) {
  let x = Math.imul(cx | 0, 1664525) + 1013904223 | 0
  let y = Math.imul(cy | 0, 1664525) + 1013904223 | 0
  let z = Math.imul(cz | 0, 1664525) + 1013904223 | 0

  x = x + Math.imul(y, z) | 0
  y = y + Math.imul(z, x) | 0
  z = z + Math.imul(x, y) | 0

  x ^= x >>> 16
  y ^= y >>> 16
  z ^= z >>> 16

  x = x + Math.imul(y, z) | 0
  y = y + Math.imul(z, x) | 0
  z = z + Math.imul(x, y) | 0

  // Top 24 bits: exact in float32 as well as float64.
  out[0] = (x >>> 8) / 16777216 - 0.5
  out[1] = (y >>> 8) / 16777216 - 0.5
  out[2] = (z >>> 8) / 16777216 - 0.5
  return out
}

const r = [0, 0, 0] // scratch, avoids per-call allocation

// Corner contribution: dot(random3(corner), offset)
function gradient(cx, cy, cz, ox, oy, oz) {
  random3(cx, cy, cz, r)
  return r[0] * ox + r[1] * oy + r[2] * oz
}

export function simplex3d(px, py, pz) {
  // vec3 s = floor(p + dot(p, vec3(F3)));
  const skew = (px + py + pz) * F3
  const sx = Math.floor(px + skew)
  const sy = Math.floor(py + skew)
  const sz = Math.floor(pz + skew)

  // vec3 x = p - s + dot(s, vec3(G3));
  const unskew = (sx + sy + sz) * G3
  const x0 = px - sx + unskew
  const y0 = py - sy + unskew
  const z0 = pz - sz + unskew

  // vec3 e = step(vec3(0.0), x - x.yzx);
  const ex = step(0, x0 - y0)
  const ey = step(0, y0 - z0)
  const ez = step(0, z0 - x0)

  // vec3 i1 = e * (1.0 - e.zxy);
  const i1x = ex * (1 - ez)
  const i1y = ey * (1 - ex)
  const i1z = ez * (1 - ey)
  // vec3 i2 = 1.0 - e.zxy * (1.0 - e);
  const i2x = 1 - ez * (1 - ex)
  const i2y = 1 - ex * (1 - ey)
  const i2z = 1 - ey * (1 - ez)

  // x1 = x - i1 + G3;  x2 = x - i2 + 2.0*G3;  x3 = x - 1.0 + 3.0*G3;
  const x1x = x0 - i1x + G3, x1y = y0 - i1y + G3, x1z = z0 - i1z + G3
  const x2x = x0 - i2x + 2 * G3, x2y = y0 - i2y + 2 * G3, x2z = z0 - i2z + 2 * G3
  const x3x = x0 - 1 + 3 * G3, x3y = y0 - 1 + 3 * G3, x3z = z0 - 1 + 3 * G3

  // w = max(0.6 - dot(x, x), 0.0), then w^4
  let w0 = Math.max(0.6 - (x0 * x0 + y0 * y0 + z0 * z0), 0)
  let w1 = Math.max(0.6 - (x1x * x1x + x1y * x1y + x1z * x1z), 0)
  let w2 = Math.max(0.6 - (x2x * x2x + x2y * x2y + x2z * x2z), 0)
  let w3 = Math.max(0.6 - (x3x * x3x + x3y * x3y + x3z * x3z), 0)
  w0 *= w0; w0 *= w0
  w1 *= w1; w1 *= w1
  w2 *= w2; w2 *= w2
  w3 *= w3; w3 *= w3

  // d.x = dot(random3(s), x); d.y = dot(random3(s + i1), x1); ...
  const d0 = gradient(sx, sy, sz, x0, y0, z0)
  const d1 = gradient(sx + i1x, sy + i1y, sz + i1z, x1x, x1y, x1z)
  const d2 = gradient(sx + i2x, sy + i2y, sz + i2z, x2x, x2y, x2z)
  const d3 = gradient(sx + 1, sy + 1, sz + 1, x3x, x3y, x3z)

  // return dot(d * w, vec4(52.0));
  return 52 * (d0 * w0 + d1 * w1 + d2 * w2 + d3 * w3)
}

// simplex3d(scale * m * rot): one dot product per matrix column, like the GLSL.
const rotated = (mx, my, mz, scale, [c0, c1, c2]) => simplex3d(
  scale * (mx * c0[0] + my * c0[1] + mz * c0[2]),
  scale * (mx * c1[0] + my * c1[1] + mz * c1[2]),
  scale * (mx * c2[0] + my * c2[1] + mz * c2[2]),
)

export function simplex3dFractal(mx, my, mz) {
  const [w1, w2, w3, w4] = FRACTAL_WEIGHTS
  return w1 * rotated(mx, my, mz, 1, ROT1)
    + w2 * rotated(mx, my, mz, 2, ROT2)
    + w3 * rotated(mx, my, mz, 4, ROT3)
    + w4 * simplex3d(8 * mx, 8 * my, 8 * mz)
}
