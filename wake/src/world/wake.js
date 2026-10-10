import { Vector3 } from 'three/webgpu'
import { PLANET, BOAT, WAKE } from '../config.js'
import { uniforms } from '../uniforms.js'

// Keeps the boat's recent stern positions in the `wakeTrail` uniform array
// (index 0 = live position, 1.. = snapshots every WAKE.interval seconds, newest
// first). tsl/wake.js turns them into foam rings on the water.
export function createWake() {
  const trail = uniforms.wakeTrail.array
  let since = 0 // seconds since the last snapshot
  const stern = new Vector3()
  const forward = new Vector3()
  const bow = new Vector3()

  return {
    update(delta, boatState) {
      forward.copy(boatState.heading).addScaledVector(boatState.dir, -boatState.heading.dot(boatState.dir)).normalize()
      stern.copy(boatState.dir).multiplyScalar(PLANET.radius).addScaledVector(forward, -WAKE.sternOffset).normalize()
      const strength = Math.min(1.3, boatState.vel.length() / BOAT.maxSpeed) // no foam when stopped or anchored
      trail[0].set(stern.x, stern.y, stern.z, strength)

      // The bow splash sits just ahead of the middle of the boat.
      bow.copy(boatState.dir).multiplyScalar(PLANET.radius).addScaledVector(forward, WAKE.bowOffset).normalize()
      uniforms.wakeBow.value.set(bow.x, bow.y, bow.z, strength ** 1.3)

      since += delta
      while (since >= WAKE.interval) {
        since -= WAKE.interval
        for (let i = trail.length - 1; i >= 2; i--) trail[i].copy(trail[i - 1])
        trail[1].copy(trail[0])
      }
      uniforms.wakeSince.value = since
    },
  }
}
