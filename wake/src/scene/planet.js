import { IcosahedronGeometry, Mesh } from 'three/webgpu'
import { PLANET } from '../config.js'
import { createWaterMaterial } from '../tsl/waterMaterial.js'

// `fish`: the fish's buffers (scene/fish.js), whose shadows the water paints.
export function createPlanet(fish) {
  // Non-indexed geometry: every triangle owns its vertices, which is what
  // gives the faceted low-poly look together with flat shading.
  const geometry = new IcosahedronGeometry(PLANET.radius, PLANET.detail)
  const mesh = new Mesh(geometry, createWaterMaterial(fish.boids))
  mesh.name = 'planet-water'
  // Vertices are displaced on the GPU, so the CPU-side bounding sphere is too
  // small by up to the wave amplitude; never frustum-cull the planet.
  mesh.frustumCulled = false
  return mesh
}
