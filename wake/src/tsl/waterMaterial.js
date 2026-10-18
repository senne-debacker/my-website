import { MeshStandardNodeMaterial } from 'three/webgpu'
import { float, vec3, color, positionLocal, positionView, smoothstep, mix, vertexStage } from 'three/tsl'
import { PLANET, WATER, WAKE, BOAT_LIGHT, FISH, FISHING } from '../config.js'
import { Color } from 'three/webgpu'
import { uniforms } from '../uniforms.js'
import { waveNoise, waveAmplitude } from './waves.js'
import { wakeFoam } from './wake.js'
import { shoreFoam } from './shore.js'
import { spotFoam } from './spotFoam.js'
import { simplex3d } from './simplexNoise.js'
import { lampPool } from './lampPool.js'
import { rainHeight, surfaceBump } from './raindrops.js'
import { wakeWaves } from './wakeWaves.js'
import { QUALITY } from '../quality.js'
import { fishShadow } from './fishShadows.js'

export function createWaterMaterial(fish) {
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
  const spots = vertexStage(spotFoam(dir)) // the patches of foam over the fishing spots, see tsl/spotFoam.js
  if (WATER.flatColor) {
    n.setInterpolation('flat')
    shore.setInterpolation('flat')
    spots.setInterpolation('flat')
  }

  const slope = smoothstep(float(-0.4), float(0.5), n) // 0 in troughs -> 1 near crests
  const body = mix(uniforms.deepColor, uniforms.shallowColor, slope)

  const foamLevel = mix(float(WATER.foamThreshold), float(WATER.stormFoamThreshold), uniforms.storm)
  const waveFoam = smoothstep(foamLevel, foamLevel.add(0.1), n).max(shore.mul(0.7)).max(spots.mul(FISHING.spots.patchFoam)) // crests, shores and fishing spots

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
  const surfaceWithoutFish = mix(withWaves, uniforms.foamColor.mul(1.25), wakeMask)

  // The schools of fish under the water, seen as soft dark ellipses painted into the sea (see
  // tsl/fishShadows.js). Not on foam (a shadow would look odd there), and not far away.
  const fishDark = fishShadow(fish)(fragmentDir).mul(float(1).sub(waveFoam.max(wakeMask).mul(0.85))).mul(FISH.shadow)
  const surface = mix(surfaceWithoutFish, uniforms.deepColor.mul(0.3), fishDark)

  // Raindrops: the ported Shadertoy ripple field (tsl/raindrops.js) tilts the lighting normal, so
  // the ripples catch the sun, moon and lamp, and lightens the water colour on them a little.
  // The boat's wake waves (tsl/wakeWaves.js) are a second height field on the same surface, so
  // both bump the normal together and both lighten the crests.
  const waves = QUALITY.wakeWaves ? wakeWaves(fragmentDir) : float(0) // off on phones (the foam wash still shows)
  const rainOnly = rainHeight(fragmentDir)
  const bump = surfaceBump(rainOnly.add(waves))
  material.normalNode = bump.xyz
  // How the waves look: crests lighten the water, troughs darken it, and the highest crests near
  // the boat break into white lace (broken up with the same noise as the foam).
  const level = waves.mul(WAKE.waves.scale).clamp(-1, 1) // -1 (trough) .. 1 (crest)
  const lit = mix(surface, uniforms.shallowColor.mul(1.8), level.max(0).mul(WAKE.waves.shade))
  const shaded = mix(lit, uniforms.deepColor.mul(0.6), level.negate().max(0).mul(WAKE.waves.shade))
  const crestFoam = smoothstep(float(WAKE.waves.foam[0]), float(WAKE.waves.foam[1]), level.add(lace.mul(WAKE.breakup))).mul(WAKE.waves.foamStrength)
  const withCrests = mix(shaded, uniforms.foamColor.mul(1.25), crestFoam)
  material.colorNode = mix(withCrests, mix(uniforms.shallowColor.mul(2), uniforms.foamColor, 0.5), surfaceBump(rainOnly).w) // the rain, not the wake, lightens the colour

  // The bow lamp's pool of light, along the curved surface (see tsl/lampPool.js). Strong at night,
  // faint by day. Added as emitted light so it does not depend on the lights.
  const darkness = smoothstep(float(0.35), float(-0.05), uniforms.sunElevation)
  const poolAmount = darkness.mul(1 - BOAT_LIGHT.pool.daylight).add(BOAT_LIGHT.pool.daylight)
  material.emissiveNode = color(new Color(BOAT_LIGHT.color)).mul(lampPool(fragmentDir)).mul(poolAmount).mul(uniforms.lampLevel).mul(BOAT_LIGHT.pool.strength)

  return material
}
