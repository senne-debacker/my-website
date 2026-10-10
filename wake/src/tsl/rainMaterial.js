import { MeshBasicNodeMaterial, Color } from 'three/webgpu'
import {
  Fn, float, color, instanceIndex, positionLocal, positionView, normalize, cross, fract, sin, step, smoothstep, mix,
} from 'three/tsl'
import { PLANET, RAIN } from '../config.js'
import { uniforms } from '../uniforms.js'

// Cheap float -> float hash, evaluated per rain streak from its instance index.
const hash = Fn(([x]) => fract(sin(x.mul(127.1)).mul(43758.5453)))

// Rain without any per-frame JavaScript. Every streak is an instance of a thin
// box; the vertex shader works out where it is from its instance index and the
// clock alone:
//   * a random spot on the tangent plane around the boat, projected onto the
//     sphere, so the rain falls towards the planet centre (the only "down" there is)
//   * a height that wraps from 0 to RAIN.height as time passes (fract)
//   * streaks whose random number is above the rain level collapse to a point
//     (degenerate triangles), so light rain has fewer streaks than a downpour
export function createRainMaterial() {
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })

  const id = float(instanceIndex)
  const [r1, r2, r3, r4, r5] = [0, 11.7, 23.3, 37.9, 51.1].map((offset) => hash(id.add(offset)))

  const up = uniforms.localUp
  const forward = uniforms.localForward
  const right = cross(forward, up)

  const spot = normalize(
    up.mul(PLANET.radius)
      .add(right.mul(r1.sub(0.5).mul(RAIN.area)))
      .add(forward.mul(r2.sub(0.5).mul(RAIN.area))),
  )

  const fallSpeed = r4.mul(0.6).add(0.7) // streaks fall at slightly different speeds
  const phase = r3.sub(uniforms.time.mul(RAIN.speed).mul(fallSpeed).div(RAIN.height))
  const height = fract(phase).mul(RAIN.height).add(PLANET.radius)

  const shown = step(r5, uniforms.rain)
  const world = spot.mul(height)
    .add(spot.mul(positionLocal.y)) // the streak's long axis follows the local "down"
    .add(right.mul(positionLocal.x))
    .add(forward.mul(positionLocal.z))
  material.positionNode = world.mul(shown)

  // Rain is lit by the sky: bright by day, a faint grey at night, and duller under heavy cloud.
  const light = mix(float(RAIN.nightLight), float(1), smoothstep(float(-0.15), float(0.4), uniforms.sunElevation))
    .mul(float(1).sub(uniforms.cover.mul(0.45)))
  material.colorNode = color(new Color(RAIN.color)).mul(light)
  // Streaks fade out right in front of the camera (otherwise they are huge bars) and
  // in planet view.
  const nearFade = smoothstep(float(0.8), float(2.8), positionView.length())
  material.opacityNode = uniforms.rain.mul(RAIN.opacity).mul(light.mul(0.5).add(0.5)).mul(uniforms.skyAmount).mul(nearFade)
  return material
}
