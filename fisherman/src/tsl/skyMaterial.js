import { MeshBasicNodeMaterial, BackSide, Color } from 'three/webgpu'
import {
  Fn, float, vec3, color as colorNode, positionLocal, smoothstep, mix, max, floor, fract, dot, sin, step, length,
} from 'three/tsl'
import { DAY } from '../config.js'
import { uniforms } from '../uniforms.js'

const STAR_GRID = 90 // cells per unit of direction; ~0.6 degrees per cell
const STAR_DENSITY = 0.03 // fraction of cells that hold a star

// Cheap GPU-only hash (no CPU twin needed: stars are decoration).
const hash13 = Fn(([p]) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453)))

// Stars: split space into a 3D grid, give some cells a star at a jittered point
// and light up the part of the sky close to it.
const starField = Fn(([dir]) => {
  const p = dir.mul(STAR_GRID)
  const cell = floor(p)
  const random = hash13(cell)
  const jitter = vec3(hash13(cell.add(17.1)), hash13(cell.add(43.7)), hash13(cell.add(91.3))).sub(0.5).mul(0.5)
  const distance = length(fract(p).sub(0.5).sub(jitter))
  const dot_ = float(1).sub(smoothstep(float(0), float(0.2), distance))
  const present = step(float(1 - STAR_DENSITY), random)
  const brightness = random.sub(1 - STAR_DENSITY).div(STAR_DENSITY).mul(0.8).add(0.2)
  const twinkle = sin(uniforms.time.mul(2.5).add(random.mul(60))).mul(0.25).add(0.75)
  return dot_.mul(present).mul(brightness).mul(twinkle)
})

// The sky dome: a big inverted sphere that follows the camera. Everything is
// computed from the view direction, so there are no textures.
//   gradient   horizon colour -> zenith colour by height above the local horizon
//   sun, moon  bright disc + halo (the moon is opposite the sun)
//   stars      fade in at night and towards the zenith
// In planet view (`skyAmount` -> 0) it turns into a plain star field.
export function createSkyMaterial() {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, depthTest: false, fog: false })

  const dir = positionLocal.normalize() // the dome is centred on the camera, so this is the view direction
  // Sine of the angle above the planet's visible edge (see horizonDip).
  const height = dir.dot(uniforms.localUp).add(uniforms.horizonDip.mul(uniforms.skyAmount))

  const climb = smoothstep(float(0), float(0.7), height).pow(0.75)
  const sky = mix(uniforms.skyHorizon, uniforms.skyZenith, climb)
  const space = vec3(0.012, 0.018, 0.035)
  let color = mix(space, sky, uniforms.skyAmount)

  // Sun: halo + disc. It fades out once it is well below the horizon, except in
  // planet view where it is always shown.
  const sunDot = max(dir.dot(uniforms.sunDir), 0)
  // Cloud cover hides the sun and moon (but not from space).
  const clear = mix(float(1), float(1).sub(uniforms.cover.mul(0.9)), uniforms.skyAmount)
  const sunFade = mix(float(1), smoothstep(float(-0.2), float(0.05), uniforms.sunElevation), uniforms.skyAmount).mul(clear)
  // In space there is no atmosphere to scatter the light: keep only a small glow.
  const haloAmount = mix(float(0.15), float(1), uniforms.skyAmount)
  const halo = sunDot.pow(14).mul(0.55).add(sunDot.pow(3).mul(0.14)).mul(haloAmount)
  const disc = smoothstep(float(0.99925), float(0.99965), sunDot)
  color = color.add(uniforms.sunColor.mul(halo).mul(sunFade))
  color = mix(color, uniforms.sunColor.mul(4).add(0.4), disc.mul(sunFade)) // orange at sunset, near white at noon

  // Moon: opposite the sun.
  const moonDot = max(dir.dot(uniforms.sunDir.negate()), 0)
  const moonFade = mix(float(1), smoothstep(float(-0.2), float(0.05), uniforms.sunElevation.negate()), uniforms.skyAmount).mul(clear)
  const moonDisc = smoothstep(float(0.9993), float(0.9996), moonDot)
  color = mix(color, colorNode(new Color(DAY.moonDiscColor)).mul(1.6), moonDisc.mul(moonFade))

  // Stars: hidden near the horizon (haze) and by the sun's glare.
  const starMask = mix(float(1), smoothstep(float(0), float(0.3), height), uniforms.skyAmount)
  color = color.add(vec3(1.0, 0.97, 0.9).mul(starField(dir)).mul(uniforms.stars).mul(starMask).mul(float(1).sub(disc)))

  material.colorNode = color
  return material
}
