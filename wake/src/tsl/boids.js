// TSL (compute shader) port of the boids simulation from the Shadertoy "[SH17C] Schooling" by
// P_Malin (@P_Malin), entry for round 3 of the Shadertoy competition 2017: the "Buf B" tab,
// "Boids Simulation". See "Third-party code" in the README for the URL and the licence note.
// Its hash is "Hash without Sine" by Dave Hoskins (https://www.shadertoy.com/view/4djSRW).
//
// The original header cites Craig Reynolds: "Flocks, Herds, and Schools: A Distributed
// Behavioral Model" (1987) and "Steering Behaviors For Autonomous Characters" (1999).
//
// What the original does: every boid stores a position and a velocity. Each frame, every boid
// looks at its neighbours and is steered by simple rules:
//   separation  steer away from neighbours that are too close (the closer, the stronger)
//   cohesion    steer towards the average position of the neighbours
//   alignment   steer towards the average velocity of the neighbours
//   a small random walk, and avoidance of walls and rocks
// The steering is limited, added to the velocity, the speed is kept between a minimum and a
// maximum, and the boid moves. There is no leader: schools form by themselves, split and merge.
//
// In Shadertoy the state lives in a texture (one pixel per value, `iChannelSim`, read back as
// the previous frame). Here it lives in storage buffers, double buffered: a kernel reads the
// previous state of everyone and writes the new state.
//
// CHANGED, to fit this project (each is marked "CHANGED" below):
//   * the world is the sea of the planet, not a 10 x 10 wrap-around square: every boid sits on
//     the sphere (stored as a unit direction) and moves in the tangent plane;
//   * lengths and speeds are scaled to the planet (FISH.lengthScale / FISH.frameRate);
//   * the walls and the three rocks are replaced by the real islands and rocks of the world;
//   * the three weights come from the config (the original's sliders);
//   * fish also swim away from the boat (an addition).

import {
  Fn, Loop, float, vec3, vec4, uniform, instancedArray, instanceIndex, fract, dot, length, normalize,
  clamp, max, step, mix, sqrt, acos,
} from 'three/tsl'
import { PLANET, FISH, WORLD } from '../config.js'
import { uniforms } from '../uniforms.js'

const R = PLANET.radius
const L = FISH.lengthScale
const COUNT = FISH.count

// GLSL: #define HASHSCALE3 vec3(.1031, .1030, .0973)
const HASHSCALE3 = vec3(0.1031, 0.103, 0.0973)

// GLSL: vec3 hash31(float p){ vec3 p3 = fract(vec3(p) * HASHSCALE3);
//        p3 += dot(p3, p3.yzx+19.19);  return fract((p3.xxy+p3.yzz)*p3.zyx); }
export const hash31 = Fn(([p]) => {
  const p3 = fract(vec3(p).mul(HASHSCALE3)).toVar()
  p3.addAssign(dot(p3, p3.yzx.add(19.19)))
  return fract(p3.xxy.add(p3.yzz).mul(p3.zyx))
})

// Removes the part of `v` along `up`: the part that lies in the tangent plane (the original
// keeps everything in the plane with `vSteer.y = 0` / `vel.y = 0` / `pos.y = 0`).
const tangent = (v, up) => v.sub(up.mul(dot(v, up)))

// GLSL: void ClampMagnitude( inout vec3 v, float fMinMag, float fMaxMag ){
//        float fMagnitude = clamp( length( v ), fMinMag, fMaxMag );
//        v = normalize( v ) * fMagnitude; }
// (guarded: normalize of a zero vector is not defined)
const clampMagnitude = (v, minMag, maxMag) => {
  const magnitude = length(v)
  return v.div(max(magnitude, 1e-6)).mul(clamp(magnitude, minMag, maxMag))
}

export function createBoids(initial) {
  // Double-buffered state: a kernel reads one set and writes the other. `dir.w` is the fish's
  // own random phase (for its swimming), `vel.w` its school number (for its colour).
  // Velocities are kept in the original's units (per frame of the original).
  const dir = [instancedArray(initial.dir, 'vec4'), instancedArray(initial.dir.slice(), 'vec4')]
  const vel = [instancedArray(initial.vel, 'vec4'), instancedArray(initial.vel.slice(), 'vec4')]
  // What the drawing reads: written by both kernels.
  const drawDir = instancedArray(initial.dir.slice(), 'vec4')
  const drawVel = instancedArray(initial.vel.slice(), 'vec4')
  // For the shadows: the fish's forward direction (xyz) and its size factor (w)
  const drawFwd = instancedArray(initial.dir.slice(), 'vec4')

  // Frames of the original to advance in this call (set from JavaScript every frame).
  const frames = uniform(1)
  // How scared the fish are of the boat right now, 0..1+ (bigger when it goes fast).
  const scare = uniform(0)

  const makeKernel = (from, to) => Fn(() => {
    const index = instanceIndex
    const me = from.dir.element(index)
    const myDir = me.xyz.toVar()
    const myVel = tangent(from.vel.element(index).xyz, myDir).toVar()

    // GLSL: float fSeparationDist = 0.75; fCohesionDist = 0.75; fAlignmentDist = 0.75;
    //       float fCollisionAvoidDist = 1.0;
    const separationDist = 0.75
    const cohesionDist = 0.75
    const alignmentDist = 0.75
    const collisionAvoidDist = 1.0

    // GLSL: float fCohesionWeight = 0.01 * UI_GetFloat( DATA_COHESION );
    //       float fSeparationWeight = 0.0002 * UI_GetFloat( DATA_SEPARATION );
    //       float fAlignmentWeight = 0.1 * UI_GetFloat( DATA_ALIGNMENT );
    //       float fRandomWalkWeight = 0.002;  float fCollisionAvoidWeight = 0.001;
    //       float fMaxSteer = 0.01;  float fMinSpeed = 0.03;  float fMaxSpeed = 0.1;
    const cohesionWeight = 0.01 * FISH.cohesion
    const separationWeight = 0.0002 * FISH.separation
    const alignmentWeight = 0.1 * FISH.alignment
    const randomWalkWeight = 0.002
    const collisionAvoidWeight = 0.001
    const minSpeed = 0.03
    const maxSpeed = 0.1

    const separationSteering = vec3(0).toVar()
    const cohesionSum = vec3(0).toVar()
    const cohesionCount = float(0).toVar()
    const alignmentSum = vec3(0).toVar()
    const alignmentCount = float(0).toVar()

    // GLSL: for ( int iOtherIndex = 0; iOtherIndex < MAX_BOID_COUNT; iOtherIndex++ ) { ... }
    Loop(COUNT, ({ i }) => {
      const other = float(i)
      const notMe = float(other).notEqual(float(index)).select(1, 0) // GLSL: if ( index == iOtherIndex ) continue;

      const otherDir = from.dir.element(i).xyz
      const otherVel = tangent(from.vel.element(i).xyz, myDir)

      // GLSL: vec3 vToOther = otherBoid.vPos - thisBoid.vPos;
      //       vToOther = mod( vToOther + WORLD_SIZE * .5, WORLD_SIZE) - WORLD_SIZE * .5;  (wrap-around)
      // CHANGED: no wrap-around; the offset along the sphere, in the tangent plane, in the units of the original
      const toOther = tangent(otherDir.sub(myDir).mul(R), myDir).div(L)
      const distToOther = length(toOther)
      const dirToOther = toOther.div(max(distToOther, 1e-5)) // GLSL: normalize(vToOther)

      // GLSL: if ( fDistToOther < fSeparationDist ) {
      //         float fSeparationStrength = 1.0 / (fDistToOther * fDistToOther);
      //         vSeparationSteering += -vDirToOther * fSeparationStrength; }
      const nearForSeparation = step(distToOther, separationDist).mul(notMe)
      const separationStrength = float(1).div(max(distToOther, 0.02).pow(2)) // (guarded against a zero distance)
      separationSteering.addAssign(dirToOther.negate().mul(separationStrength).mul(nearForSeparation))

      // GLSL: if ( fDistToOther < fCohesionDist ) { vCohesionCentre += vOtherPos; fCohesionCount++; }
      // (the steering is centre - own position = the average of vToOther, so the offsets are summed)
      const nearForCohesion = step(distToOther, cohesionDist).mul(notMe)
      cohesionSum.addAssign(toOther.mul(nearForCohesion))
      cohesionCount.addAssign(nearForCohesion)

      // GLSL: if ( fDistToOther < fAlignmentDist ) { vAlignmentDir += otherBoid.vVel; fAlignmentCount++; }
      const nearForAlignment = step(distToOther, alignmentDist).mul(notMe)
      alignmentSum.addAssign(otherVel.mul(nearForAlignment))
      alignmentCount.addAssign(nearForAlignment)
    })

    // GLSL: if ( fCohesionCount > 0.0 ) { vCohesionCentre /= fCohesionCount;
    //         vCohesionSteering += vCohesionCentre - thisBoid.vPos; }
    const cohesionSteering = cohesionSum.div(max(cohesionCount, 1))
    // GLSL: if ( fAlignmentCount > 0.0 ) { vAlignmentDir /= fAlignmentCount;
    //         vAlignmentSteering += vAlignmentDir - thisBoid.vVel; }
    const alignmentSteering = alignmentSum.div(max(alignmentCount, 1)).sub(myVel).mul(step(0.5, alignmentCount))

    // GLSL: vRandomSteering = ( hash31( float( index ) + iTime ) * 2.0 - 1.0 );
    // CHANGED: kept in the tangent plane; the original draws a new random number every frame of
    // its (fast) animation, here one is drawn every real frame, so its size is raised by
    // 1/sqrt(frames) to give the same random walk.
    const randomSteering = tangent(hash31(float(index).add(uniforms.time)).mul(2).sub(1), myDir).div(sqrt(frames))

    // GLSL: if ( fSceneDistance < fCollisionAvoidDist ) { vNormal = Scene_Normal( pos );
    //         fDist = max( fSceneDistance / fCollisionAvoidDist, 0.01 );
    //         vCollisionAvoidSteering += vNormal / ( fDist ); }
    // CHANGED: the scene is the islands and rocks of the world (uniforms.shoreBodies: direction and
    // shoreline radius), the distance is to the nearest one's outer edge and the normal points away from it.
    const nearest = float(1000).toVar()
    const awayFromNearest = vec3(0).toVar()
    Loop(WORLD.maxBodies, ({ i }) => {
      const body = uniforms.shoreBodies.element(i) // xyz = direction, w = radius (negative = unused slot)
      const edge = body.w.mul(1.45).add(0.15) // an island's mesh reaches about 1.4 x its shoreline radius
      const distance = acos(clamp(dot(myDir, body.xyz), -1, 1)).mul(R).sub(edge).div(L) // to the edge, original units
      const closer = step(distance, nearest)
      nearest.assign(mix(nearest, distance, closer))
      awayFromNearest.assign(mix(awayFromNearest, normalize(tangent(myDir.sub(body.xyz.mul(dot(myDir, body.xyz))), myDir).add(1e-5)), closer))
    })
    const avoidAmount = step(nearest, collisionAvoidDist)
    const collisionAvoidSteering = awayFromNearest.div(max(nearest.div(collisionAvoidDist), 0.01)).mul(avoidAmount)

    // Added: swim away from the boat (position = uniforms.lampDir), the more so the closer it is.
    const toBoat = tangent(uniforms.lampDir.sub(myDir).mul(R), myDir).div(L)
    const boatDistance = length(toBoat)
    const fleeRadius = FISH.fleeRadius / L
    const fleeAmount = clamp(float(1).sub(boatDistance.div(fleeRadius)), 0, 1)
    const fleeSteering = toBoat.div(max(boatDistance, 1e-4)).negate().mul(fleeAmount.mul(fleeAmount)).mul(scare).mul(FISH.fleeWeight / 0.001)

    // GLSL: vSteer += vCohesionSteering * fCohesionWeight;  vSteer += vSeparationSteering * fSeparationWeight; ...
    const steer = tangent(
      cohesionSteering.mul(cohesionWeight)
        .add(separationSteering.mul(separationWeight))
        .add(alignmentSteering.mul(alignmentWeight))
        .add(randomSteering.mul(randomWalkWeight))
        .add(collisionAvoidSteering.mul(collisionAvoidWeight))
        .add(fleeSteering.mul(collisionAvoidWeight)),
      myDir,
    )
    // GLSL: ClampMagnitude( vSteer, 0.0, 0.01 );  thisBoid.vVel += vSteer;
    // CHANGED: scaled by the number of frames of the original that pass in this call
    const newVel = tangent(myVel.add(clampMagnitude(steer, 0, 0.01).mul(frames)), myDir)
    // GLSL: ClampMagnitude( thisBoid.vVel, fMinSpeed, fMaxSpeed );
    const limitedVel = clampMagnitude(newVel, minSpeed, maxSpeed)

    // GLSL: thisBoid.vPos += thisBoid.vVel;   (then wrapped into the world)
    // CHANGED: moves along the sphere: the step in world units is added to the position on the sphere,
    // which is then pushed back onto it, and the velocity is turned to stay in the new tangent plane.
    const newDir = normalize(myDir.mul(R).add(limitedVel.mul(frames).mul(L))).toVar()
    const speed = length(limitedVel)
    const velOnNew = clampMagnitude(tangent(limitedVel, newDir), speed, speed)

    to.dir.element(index).assign(vec4(newDir, me.w))
    to.vel.element(index).assign(vec4(velOnNew, from.vel.element(index).w))
    // What the shadows read (tsl/fishShadows.js). Each fish has its own depth (a hash of its index):
    // a deeper fish makes a fainter (strength in .w of the position) and smaller (size in .w of the
    // forward direction) shadow, as it would look through water; each school has its own size too.
    const school = from.vel.element(index).w
    const deep = hash31(float(index)).x
    const schoolSize = hash31(school.add(7)).x.mul(0.5).add(0.85) // 0.85 .. 1.35
    drawDir.element(index).assign(vec4(newDir, float(1).sub(deep.mul(0.55))))
    drawVel.element(index).assign(vec4(velOnNew, school))
    drawFwd.element(index).assign(vec4(normalize(velOnNew), schoolSize.mul(float(1).sub(deep.mul(0.25)))))
  })().compute(COUNT)

  const kernels = [makeKernel({ dir: dir[0], vel: vel[0] }, { dir: dir[1], vel: vel[1] }), makeKernel({ dir: dir[1], vel: vel[1] }, { dir: dir[0], vel: vel[0] })]
  let parity = 0

  return {
    drawDir,
    drawVel,
    drawFwd,
    // Advance the simulation. `delta` is real seconds; `boatScare` how scared the fish are.
    step(renderer, delta, boatScare) {
      frames.value = Math.min(delta, 0.05) * FISH.frameRate
      scare.value = boatScare
      renderer.compute(kernels[parity])
      parity ^= 1
    },
  }
}
