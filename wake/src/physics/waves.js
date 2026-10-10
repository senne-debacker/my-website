// CPU twin of src/tsl/waves.js. Both read their parameters from config.js.

import { Vector3 } from 'three/webgpu'
import { PLANET, WAVES } from '../config.js'
import { simplex3dFractal } from './simplexNoise.js'

const mix = (a, b, t) => a * (1 - t) + b * t

// Unitless wave field in roughly [-1, 1]; `dir` must be a unit vector.
export function waveNoise(dir, time) {
  return simplex3dFractal(
    dir.x * WAVES.frequency,
    dir.y * WAVES.frequency,
    dir.z * WAVES.frequency + time * WAVES.speed,
  )
}

export function waveAmplitude(storm) {
  return mix(WAVES.calmAmplitude, WAVES.stormAmplitude, storm)
}

// Wave height above the base sphere, in world units.
export function sampleHeight(dir, time, storm) {
  return waveNoise(dir, time) * waveAmplitude(storm)
}

// World-space point on the displaced water surface in direction `dir`.
export function surfacePoint(dir, time, storm, target = new Vector3()) {
  return target.copy(dir).multiplyScalar(PLANET.radius + sampleHeight(dir, time, storm))
}
