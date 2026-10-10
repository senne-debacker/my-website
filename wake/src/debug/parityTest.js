// Dev-only: open the app with `?parity` to run this.
//
// Runs the TSL noise/wave functions in a compute shader, reads the results
// back and compares them with the JS twin in src/physics/. The boat physics is
// only trustworthy if these agree.

import { IcosahedronGeometry, Vector3 } from 'three/webgpu'
import { Fn, instancedArray, instanceIndex, vec4 } from 'three/tsl'
import { PLANET } from '../config.js'
import { uniforms } from '../uniforms.js'
import { random3 as random3Tsl, simplex3d as simplex3dTsl, simplex3dFractal as fractalTsl } from '../tsl/simplexNoise.js'
import { waveNoise as waveNoiseTsl, waveAmplitude as waveAmplitudeTsl } from '../tsl/waves.js'
import { random3 as random3Js, simplex3d as simplex3dJs, simplex3dFractal as fractalJs } from '../physics/simplexNoise.js'
import { waveNoise as waveNoiseJs, waveAmplitude as waveAmplitudeJs, sampleHeight } from '../physics/waves.js'

const COUNT = 4096

// Tolerances: float32 on the GPU vs float64 on the CPU.
const TOLERANCE = { noise: 1e-4, height: 1e-4 }

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Run `build(vec4 input) -> vec4 output` for every input on the GPU.
async function runKernel(renderer, input, build) {
  const count = input.length / 4
  const inBuffer = instancedArray(input, 'vec4')
  const outBuffer = instancedArray(count, 'vec4')

  const kernel = Fn(() => {
    outBuffer.element(instanceIndex).assign(build(inBuffer.element(instanceIndex)))
  })().compute(count)

  await renderer.computeAsync(kernel)
  return new Float32Array(await renderer.getArrayBufferAsync(outBuffer.value))
}

function randomInputs(rng, fill) {
  const data = new Float32Array(COUNT * 4)
  for (let i = 0; i < COUNT; i++) fill(rng, data, i * 4)
  return data
}

const maxError = (gpu, cpu, count, stride = 4, offset = 0) => {
  let max = 0
  for (let i = 0; i < count; i++) max = Math.max(max, Math.abs(gpu[i * stride + offset] - cpu[i]))
  return max
}

// 1. The hash must be bit-identical.
async function testHash(renderer, rng) {
  const input = randomInputs(rng, (r, d, o) => {
    for (let k = 0; k < 3; k++) d[o + k] = Math.floor(r() * 121) - 60 // integer lattice corners, negatives included
  })
  const gpu = await runKernel(renderer, input, (v) => vec4(random3Tsl(v.xyz), 0))

  const out = [0, 0, 0]
  let mismatches = 0
  for (let i = 0; i < COUNT; i++) {
    random3Js(input[i * 4], input[i * 4 + 1], input[i * 4 + 2], out)
    for (let k = 0; k < 3; k++) if (Math.fround(out[k]) !== gpu[i * 4 + k]) mismatches++
  }
  return { name: 'random3 (exact)', error: mismatches, tolerance: 0, unit: 'mismatching values' }
}

// 2. The simplex functions on arbitrary points (covers negative lattice coords).
async function testSimplex(renderer, rng) {
  const input = randomInputs(rng, (r, d, o) => {
    for (let k = 0; k < 3; k++) d[o + k] = (r() - 0.5) * 40
  })
  const gpu = await runKernel(renderer, input, (v) => vec4(simplex3dTsl(v.xyz), fractalTsl(v.xyz), 0, 0))

  const single = new Float64Array(COUNT)
  const fractal = new Float64Array(COUNT)
  for (let i = 0; i < COUNT; i++) {
    const [x, y, z] = [input[i * 4], input[i * 4 + 1], input[i * 4 + 2]]
    single[i] = simplex3dJs(x, y, z)
    fractal[i] = fractalJs(x, y, z)
  }
  return [
    { name: 'simplex3d', error: maxError(gpu, single, COUNT, 4, 0), tolerance: TOLERANCE.noise },
    { name: 'simplex3dFractal', error: maxError(gpu, fractal, COUNT, 4, 1), tolerance: TOLERANCE.noise },
  ]
}

// 3. The wave field on the sphere at different times and weather.
async function testWaves(renderer, rng) {
  const input = randomInputs(rng, (r, d, o) => {
    const v = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    d[o] = v.x; d[o + 1] = v.y; d[o + 2] = v.z
  })

  const results = []
  for (const { time, storm } of [{ time: 0, storm: 0 }, { time: 12.3456, storm: 0.5 }, { time: 600, storm: 1 }, { time: 3600, storm: 1 }]) {
    uniforms.time.value = time
    uniforms.storm.value = storm
    const gpu = await runKernel(renderer, input, (v) => {
      const noise = waveNoiseTsl(v.xyz)
      return vec4(noise, noise.mul(waveAmplitudeTsl), 0, 0)
    })

    const dir = new Vector3()
    const noise = new Float64Array(COUNT)
    const height = new Float64Array(COUNT)
    const gpuTime = Math.fround(time) // the uniform is float32 on the GPU
    for (let i = 0; i < COUNT; i++) {
      dir.set(input[i * 4], input[i * 4 + 1], input[i * 4 + 2])
      noise[i] = waveNoiseJs(dir, gpuTime)
      height[i] = noise[i] * waveAmplitudeJs(storm)
    }
    const label = `t=${time}, storm=${storm}`
    results.push(
      { name: `waveNoise   (${label})`, error: maxError(gpu, noise, COUNT, 4, 0), tolerance: TOLERANCE.noise },
      { name: `waveHeight  (${label})`, error: maxError(gpu, height, COUNT, 4, 1), tolerance: TOLERANCE.height, unit: 'world units' },
    )
  }
  return results
}

// 4. How far is the smooth surface the boat samples from the faceted one the
//    GPU draws? Compares every triangle's centroid with the continuous field.
function measureFacetDeviation() {
  const positions = new IcosahedronGeometry(PLANET.radius, PLANET.detail).attributes.position
  const [a, b, c, centroid] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
  const displaced = (v) => v.normalize().multiplyScalar(PLANET.radius + sampleHeight(v, 0, storm))
  let storm = 0

  const rows = []
  for (const s of [0, 1]) {
    storm = s
    const deviations = []
    for (let i = 0; i < positions.count; i += 3) {
      displaced(a.fromBufferAttribute(positions, i))
      displaced(b.fromBufferAttribute(positions, i + 1))
      displaced(c.fromBufferAttribute(positions, i + 2))
      centroid.copy(a).add(b).add(c).divideScalar(3)
      const radius = centroid.length()
      const truth = PLANET.radius + sampleHeight(centroid.normalize(), 0, storm)
      deviations.push(Math.abs(radius - truth))
    }
    deviations.sort((x, y) => x - y)
    rows.push({
      storm: s,
      triangles: deviations.length,
      mean: deviations.reduce((sum, d) => sum + d, 0) / deviations.length,
      p99: deviations[Math.floor(deviations.length * 0.99)],
      max: deviations[deviations.length - 1],
    })
  }
  return rows
}

export async function runParityTest(renderer) {
  const rng = mulberry32(20261008)
  const results = [
    await testHash(renderer, rng),
    ...(await testSimplex(renderer, rng)),
    ...(await testWaves(renderer, rng)),
  ].map((r) => ({ ...r, pass: r.error <= r.tolerance }))

  const facets = measureFacetDeviation()
  const allPass = results.every((r) => r.pass)

  const lines = [
    `GPU vs CPU parity: ${allPass ? 'PASS' : 'FAIL'}`,
    ...results.map((r) => `${r.pass ? 'ok  ' : 'FAIL'} ${r.name.padEnd(36)} max error ${r.error.toExponential(2)} ${r.unit ?? ''}`),
    '',
    'Facet deviation (CPU smooth field vs GPU triangle centroids), world units:',
    ...facets.map((f) => `  storm=${f.storm}: mean ${f.mean.toFixed(4)}  p99 ${f.p99.toFixed(4)}  max ${f.max.toFixed(4)}  (${f.triangles} triangles)`),
  ]
  console.log(lines.join('\n'))

  const panel = document.createElement('pre')
  panel.textContent = lines.join('\n')
  panel.style.cssText = 'position:fixed;top:12px;left:12px;margin:0;padding:10px;border-radius:4px;background:rgba(10,16,24,.8);color:#e8efe9;font:12px/1.4 ui-monospace,monospace;pointer-events:none'
  document.body.appendChild(panel)

  uniforms.time.value = 0
  uniforms.storm.value = 0
  window.__parity = { allPass, results, facets }
  return allPass
}
