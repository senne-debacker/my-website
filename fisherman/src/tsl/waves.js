import { Fn, float, vec3, mix } from 'three/tsl'
import { WAVES } from '../config.js'
import { uniforms } from '../uniforms.js'
import { simplex3dFractal } from './simplexNoise.js'

// Unitless wave field in roughly [-1, 1] for a point on the unit sphere.
// Same trick as the Shadertoy's mainImage: time is the third noise coordinate
// (there it was `vec3(p, iTime * 0.025)`), so the field slowly evolves.
export const waveNoise = Fn(([dir]) => {
  const p = dir.mul(WAVES.frequency).add(vec3(0, 0, uniforms.time.mul(WAVES.speed)))
  return simplex3dFractal(p)
})

// Current amplitude in world units; the "storm" uniform is the user's weather knob.
export const waveAmplitude = mix(float(WAVES.calmAmplitude), float(WAVES.stormAmplitude), uniforms.storm)
