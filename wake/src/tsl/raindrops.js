// TSL port of the "worley rain" ripple shader from Shadertoy:
//   https://www.shadertoy.com/view/ldjyWw
// (a cleaned-up fork of https://www.shadertoy.com/view/4ldSRj; its hash33 comes from
//  https://www.shadertoy.com/view/4djSRW).
// Title / author / licence: see "Third-party code" in the README. The header of the original
// states no licence, so Shadertoy's default (CC BY-NC-SA 3.0) is assumed.
//
// What the original does: a grid of cells, each with a raindrop that lands at a random spot on
// its own timer; around the drop a ripple spreads and fades, and when it has faded a new drop
// lands elsewhere. The ripples of the 3 x 3 neighbouring cells are combined into a height field
// `dfRipples(p)`; the original renders the slope of that field (its normal) as colour on a flat
// plane seen from a fixed camera.
//
// How it is used here (the water is a sphere, lit by sun, moon and lamp):
//   * the height field is evaluated on the sea per pixel, on the cube face the pixel is nearest
//     to (see `rainPlane`), and
//   * its slope tilts the water's lighting normal (screen-space bump mapping), so the ripples
//     catch the light, and slightly lightens the water colour on the ripples.
// Deviations from the original are marked "CHANGED" below.

import {
  Fn, float, vec2, vec3, vec4, fract, floor, mod, dot, length, mix, smoothstep, step, abs, sign,
  cross, normalize, dFdx, dFdy, positionView, normalFlat, If, max, min,
} from 'three/tsl'
import { PLANET, DROPS } from '../config.js'
import { uniforms } from '../uniforms.js'

// GLSL: #define HASHSCALE3 vec3(.1031,.1030,.0973)
const HASHSCALE3 = vec3(0.1031, 0.103, 0.0973)

// GLSL: vec3 hash33(vec3 p3){p3=fract(p3*HASHSCALE3);
//        p3+=dot(p3,p3.yxz+19.19);
//        return fract((p3.xxy + p3.yxx)*p3.zyx);}
const hash33 = Fn(([input]) => {
  const p3 = fract(input.mul(HASHSCALE3)).toVar()
  p3.addAssign(dot(p3, p3.yxz.add(19.19)))
  return fract(p3.xxy.add(p3.yxx).mul(p3.zyx))
})

// GLSL: float bias(float s,float b){return s/((((1./b)-2.)*(1.-s))+1.);}
const bias = Fn(([s, b]) => s.div(float(1).div(b).sub(2).mul(float(1).sub(s)).add(1)))

// GLSL: #define ripp if(xy.x>.5)xy.x=mix(1.,0.,xy.x);xy.x=mix(0.,2.,xy.x)
// The macro has no braces, so the `if` only guards the first statement: the profile is folded
// ("1 - x" above one half) and then ALWAYS doubled. Applied twice in the original.
const ripple = Fn(([x]) => x.greaterThan(0.5).select(float(1).sub(x), x).mul(2)) // x > .5 ? 1 - x : x, then doubled

// GLSL: vec3 vorRain(vec3 p,float r) -- only the .x channel of the result is ever used (by
// dfRipples), so this returns that one number. `p` is already in the original's swizzled order
// (p.xzy): p.xy is the position on the ground plane, p.z its height, which is a constant 0 here.
const vorRain = Fn(([point, seed]) => {
  const scaled = point.div(DROPS.scale) //  p/=vorRainScale
  const uv2 = scaled
  const cell = floor(scaled) //  p=vec3(floor(p))
  const t = uniforms.time.mul(DROPS.timeScale) //  float t=iTime*vorRainSpeed
  const result = float(0).toVar() //  yz.x

  for (let j = -1; j <= 1; j++) {
    for (let k = -1; k <= 1; k++) {
      const offset = vec3(j, k, 0)
      // s1.xz=hash33(p+offset.xyz+127.43+r).xz;  -- the grid hash; its .x is the drop's phase
      const grid = hash33(cell.add(offset).add(127.43).add(seed))
      // CHANGED: the original never reads the .y of this hash; it is used here to switch drops
      // on and off with the rain level (a cell has a drop going when its .y is below the rain).
      const raining = step(grid.y, uniforms.rain.mul(DROPS.chance))
      // s2.xz=floor(s1.xx + t);   (s2.y is never assigned in the original: taken as 0)
      const repeat = floor(grid.x.add(t))
      const s2 = vec3(repeat, 0, repeat)
      // xz.xz=hash33(p+offset.xyz+(s2)+r).xz;  -- where in the cell the drop lands (new each repeat)
      const landing = hash33(cell.add(offset).add(s2).add(seed))
      // s1=mod(s1+t,1.);  -- the drop's age as 0..1
      const age = mod(grid.x.add(t), 1)

      // float op=1.-s1.x;  op=bias(op,.21);  -- opacity, fading over the drop's life
      const opacity = bias(float(1).sub(age), float(0.21))
      // s1.x=bias(s1.x,.62);  -- the age with a harder fade-out
      const aged = bias(age, float(0.62))
      // float size=mix(4.,1.,s1.x);  -- ripple expansion over time
      const size = mix(float(4), float(1), aged)
      // float size2=mix(.005,2.0,s1.x);
      const size2 = mix(float(0.005), float(2), aged)

      // xy.xz=vec2(length((p.xy+xz.xz)-(uv2.xy-offset.xy))*size);
      const distance = length(cell.xy.add(vec2(landing.x, landing.z)).sub(uv2.xy.sub(offset.xy))).mul(size)
      // xy.x=1.-xy.x;  xy.x*=size2;
      const x0 = float(1).sub(distance).mul(size2)
      // ripp; ripp;  xy.x=smoothstep(.0,1.,xy.x);
      const x = smoothstep(float(0), float(1), ripple(ripple(x0)))
      // xy*=op;
      const contribution = x.mul(opacity).mul(raining)
      // yz =1.-((1.-yz)*(1.-xy));  -- screen blend: overlapping ripples never exceed 1
      result.assign(float(1).sub(float(1).sub(result).mul(float(1).sub(contribution))))
    }
  }
  return result.mul(0.1) //  return vec3(yz*.1)
})

// GLSL: float dfRipples(vec3 p){ float pl=(p.y+1.); vec3 r=vec3(0);
//        for(float i=0.;i<iterRippleCount;i++) r+=vorRain(p,i+1.);  return pl-r.x;}
// iterRippleCount is 2. CHANGED: the plane term `pl` is left out: it is a constant, and only
// the ripples are wanted. The sign is kept: the surface is lowered where there is a ripple.
const rippleHeight = Fn(([point]) => vorRain(point, float(1)).add(vorRain(point, float(2))).negate())

// The original works on a flat plane; the sea here is a sphere. The ripples are only visible
// close to the camera, so the sphere is covered with three flat maps, one per axis (as a cube
// would be): each pixel uses the two coordinates of the axis along which its direction is
// longest, and each of the six faces gets its own offset so its drops differ. Near the lines
// where two faces meet the ripples are faded out, so no seam shows.
function rainPlane(dir) {
  const a = abs(dir)
  const isX = step(a.y, a.x).mul(step(a.z, a.x))
  const isY = float(1).sub(isX).mul(step(a.z, a.y))
  const isZ = float(1).sub(isX).sub(isY)
  const scaled = dir.mul(PLANET.radius)
  const uv = vec2(scaled.y, scaled.z).mul(isX).add(vec2(scaled.x, scaled.z).mul(isY)).add(vec2(scaled.x, scaled.y).mul(isZ))
  const faceOffset = vec2(sign(dir.x).mul(211.3), 17.0).mul(isX)
    .add(vec2(53.1, sign(dir.y).mul(197.7)).mul(isY))
    .add(vec2(sign(dir.z).mul(89.9), -131.3).mul(isZ))
  // how far from a seam: largest minus second largest component of the direction
  const largest = max(a.x, max(a.y, a.z))
  const smallest = min(a.x, min(a.y, a.z))
  const second = a.x.add(a.y).add(a.z).sub(largest).sub(smallest)
  const awayFromSeam = smoothstep(float(0.01), float(0.06), largest.sub(second))
  return { plane: vec3(uv.add(faceOffset), 0), awayFromSeam }
}

// Height of the rain's ripples at one pixel (negative where the surface is pushed down).
export const rainHeight = Fn(([dir]) => {
  const height = float(0).toVar()
  // Far away the ripples would be thinner than a pixel and shimmer: fade them with distance.
  const { plane, awayFromSeam } = rainPlane(dir)
  const faded = float(1).sub(smoothstep(float(DROPS.visible[0]), float(DROPS.visible[1]), positionView.length())).mul(awayFromSeam)

  // CHANGED: the ripples also fade with the rain level. Without this, a cell that still has a drop
  // keeps full-strength ripples while the rain streaks have long faded, because the level only
  // eases down slowly after a storm.
  const rainStrength = smoothstep(float(DROPS.fade[0]), float(DROPS.fade[1]), uniforms.rain)

  // It is dry for most of the time: do not compute the ripples then.
  // The condition is a uniform, so every pixel takes the same branch.
  If(uniforms.rain.greaterThan(DROPS.fade[0]), () => {
    height.assign(rippleHeight(plane).mul(DROPS.scale * DROPS.height).mul(faded).mul(rainStrength))
  })
  return height
})

// Screen-space bump mapping (Mikkelsen's "surface gradient" method): the height's slope across
// the screen, together with how the surface's position changes across the screen, gives the
// gradient of the height along the surface; subtract it from the facet's normal.
// Result as a vec4:
//   xyz  the lighting normal (view space), tilted by the height's slope
//   w    0..1, how tilted it is (the original shows this slope as the colour)
// Takes any height, so the boat's wake waves (tsl/wakeWaves.js) share it with the raindrops.
export const surfaceBump = Fn(([height]) => {
  const surfaceNormal = normalFlat
  const dpdx = dFdx(positionView)
  const dpdy = dFdy(positionView)
  const r1 = cross(dpdy, surfaceNormal)
  const r2 = cross(surfaceNormal, dpdx)
  const det = dot(dpdx, r1)
  const gradient = sign(det).mul(dFdx(height).mul(r1).add(dFdy(height).mul(r2)))
  const normal = normalize(abs(det).mul(surfaceNormal).sub(gradient))

  const tilt = length(normal.sub(surfaceNormal))
  return vec4(normal, tilt.mul(DROPS.shine).min(1))
})

// Result of the rain alone on the water at one pixel (see surfaceBump).
export const rainRipples = Fn(([dir]) => surfaceBump(rainHeight(dir)))
