import { MeshStandardNodeMaterial } from 'three/webgpu'
import { float, vec3, positionLocal, smoothstep, mix, vertexStage } from 'three/tsl'
import { PLANET, WATER, WAKE } from '../config.js'
import { uniforms } from '../uniforms.js'
import { waveNoise, waveAmplitude } from './waves.js'
import { wakeFoam } from './wake.js'
import { shoreFoam } from './shore.js'
import { simplex3d } from './simplexNoise.js'

export function createWaterMaterial() {
  const material = new MeshStandardNodeMaterial({
    roughness: 0.32,
    metalness: 0,
    flatShading: true, // normals from screen-space derivatives of the *displaced* position
  })

  // --- Vertex stage: displace along the sphere normal -----------------------
  const dir = positionLocal.normalize() // unit vector = point on the unit sphere = sphere normal
  const noise = waveNoise(dir) // the ported Shadertoy noise
  const height = noise.mul(waveAmplitude) // world units
  material.positionNode = dir.mul(float(PLANET.radius).add(height))

  // --- Colour -----------------------------------------------------------------------------------
  // vertexStage() evaluates something once per vertex and hands it to the fragment shader as a
  // varying instead of re-running it per pixel (the wave noise is 4 octaves, the wake loops over
  // 64 remembered positions). Wave and shore foam use `flat` interpolation: one value per triangle,
  // which gives the faceted low-poly look.
  const n = vertexStage(noise)
  const shore = vertexStage(shoreFoam(dir)) // surf around islands and rocks, see tsl/shore.js
  if (WATER.flatColor) {
    n.setInterpolation('flat')
    shore.setInterpolation('flat')
  }

  const slope = smoothstep(float(-0.4), float(0.5), n) // 0 in troughs -> 1 near crests
  const body = mix(uniforms.deepColor, uniforms.shallowColor, slope)

  const foamLevel = mix(float(WATER.foamThreshold), float(WATER.stormFoamThreshold), uniforms.storm)
  const waveFoam = smoothstep(foamLevel, foamLevel.add(0.1), n).max(shore.mul(0.7)) // crests and shores

  // --- The boat's wake: it must stand out from the wave foam -------------------------------------
  // The wake value comes per vertex but is NOT flat: it is interpolated smoothly across each
  // triangle. In the fragment stage it is then broken up with the ported simplex noise (at pixel
  // resolution, much finer than the triangles) and cut off sharply. The result is lacy foam with a
  // crisp edge, in a brighter white than the waves, with a lighter, aerated halo around it.
  const wake = vertexStage(wakeFoam(dir))
  const fragmentDir = positionLocal.normalize() // the interpolated position, per pixel
  const lace = simplex3d(fragmentDir.mul(PLANET.radius * WAKE.breakupScale).add(vec3(0, 0, uniforms.time.mul(0.4))))
  const wakeMask = smoothstep(float(WAKE.edge[0]), float(WAKE.edge[1]), wake.add(lace.mul(WAKE.breakup)))
  const wakeHalo = smoothstep(float(0.04), float(0.3), wake).mul(WAKE.halo)

  const wetBody = mix(body, uniforms.shallowColor.mul(1.6), wakeHalo)
  const withWaves = mix(wetBody, uniforms.foamColor, waveFoam)
  material.colorNode = mix(withWaves, uniforms.foamColor.mul(1.25), wakeMask)

  return material
}
