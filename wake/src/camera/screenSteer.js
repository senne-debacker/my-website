import { Vector3 } from 'three/webgpu'
import { PLANET } from '../config.js'

// Joystick steering in planet view. The planet camera is free, so the boat can point anywhere on
// the screen, and "stick up = bow-relative forward" feels wrong there. Here the stick is
// screen-relative instead: push the way you want the boat to go ON THE SCREEN and it turns that way
// (the helm is proportional to the angle between where the bow points on screen and where the stick
// points) and sails at the stick's deflection. Returns { throttle, steer } or null when the boat's
// heading cannot be read on the screen (the bow points straight at / away from the camera): the
// caller then uses the stick as usual.
const FULL_LOCK = 0.9 // radians off course for full helm
const p0 = new Vector3()
const p1 = new Vector3()
const bow = new Vector3()
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function screenSteer(boatState, camera, stick, aspect = 1) {
  const deflection = Math.min(1, Math.hypot(stick.x, stick.y))
  if (deflection < 0.02) return { throttle: 0, steer: 0 }

  const { dir, heading } = boatState
  bow.copy(heading).addScaledVector(dir, -heading.dot(dir)).normalize() // the bow, tangent to the sea
  p0.copy(dir).multiplyScalar(PLANET.radius)
  p1.copy(p0).addScaledVector(bow, 0.5)
  const behind = p0.dot(camera.position) < 0 // the boat is on the far side: we see it through the planet, mirrored
  p0.project(camera)
  p1.project(camera)
  const fx = (p1.x - p0.x) * aspect
  const fy = p1.y - p0.y
  if (Math.hypot(fx, fy) < 0.01) return null

  // Angle from the bow to the wanted direction, positive = anticlockwise on the screen = to port
  // (seen from outside the planet, above the boat).
  let error = Math.atan2(fx * stick.y - fy * stick.x, fx * stick.x + fy * stick.y)
  if (behind) error = -error
  const steer = Math.max(-1, Math.min(1, -error / FULL_LOCK))
  // Keep way on while turning (the helm needs speed), but ease off when the bow points away.
  const throttle = deflection * (1 - 0.45 * smoothstep(0.8, 2.2, Math.abs(error)))
  return { throttle, steer }
}
