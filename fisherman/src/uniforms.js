import { uniform, uniformArray } from 'three/tsl'
import { Color, Vector3, Vector4 } from 'three/webgpu'
import { PALETTE, WAKE, CLOUDS, WORLD } from './config.js'

const CLOUD_FAIR = CLOUDS.fairColor

// Shared uniform nodes. JS writes `.value` once per frame, the TSL graphs read
// them on the GPU. We deliberately do NOT use TSL's built-in `time` node: the
// boat physics needs the exact same clock value as the water shader.
export const uniforms = {
  time: uniform(0),
  storm: uniform(0), // 0 = calm, 1 = storm: wave height and foam (written by world/weather.js)
  cover: uniform(0), // 0 = clear, 1 = fully overcast
  rain: uniform(0), // 0 = dry, 1 = downpour

  deepColor: uniform(new Color(PALETTE.deep)),
  shallowColor: uniform(new Color(PALETTE.shallow)),
  foamColor: uniform(new Color(PALETTE.foam)),

  // Sky dome (written by world/atmosphere.js every frame).
  sunDir: uniform(new Vector3(0, 1, 0)),
  localUp: uniform(new Vector3(0, 1, 0)), // "up" at the boat: away from the planet centre
  localForward: uniform(new Vector3(0, 0, -1)), // the boat's heading, tangent to the planet
  cloudColor: uniform(new Color(CLOUD_FAIR)),
  sunElevation: uniform(1), // of the sun at the boat, -1..1
  horizonDip: uniform(0), // sine of how far below horizontal the planet's edge is, seen from the camera
  skyZenith: uniform(new Color()),
  skyHorizon: uniform(new Color()),
  sunColor: uniform(new Color()),
  stars: uniform(0),
  skyAmount: uniform(1), // 1 = sky as seen from the boat, 0 = space (planet view)

  // Boat wake: x, y, z = direction from the planet centre of a past stern position
  // (index 0 = now), w = how strongly the boat was moving then. world/wake.js fills
  // it; wakeSince is the time since the last snapshot, used to age the entries.
  wakeTrail: uniformArray(Array.from({ length: WAKE.points }, () => new Vector4(0, 1, 0, 0)), 'vec4'),
  wakeSince: uniform(0),
  wakeBow: uniform(new Vector4(0, 1, 0, 0)), // direction of the bow splash, w = strength

  // Islands and rocks the water draws shore foam around: x, y, z = direction from the
  // planet centre, w = shoreline radius (world units); w < 0 = unused slot.
  shoreBodies: uniformArray(Array.from({ length: WORLD.maxBodies }, () => new Vector4(0, 1, 0, -10)), 'vec4'),
}
