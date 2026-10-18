import { WIND } from '../config.js'

// The wind: a direction that wanders slowly round the compass and a strength that gusts, stronger in
// a storm. `bearing` is the way it BLOWS TOWARDS, in radians clockwise from north (like the compass in
// hud.js), `strength` 0..1. Only the boat's flag looks at it (scene/flag.js).
export function createWind() {
  const wind = { bearing: WIND.baseBearing, strength: 0.3 }
  wind.update = (time, storm) => {
    wind.bearing = WIND.baseBearing + 0.9 * Math.sin(time * 0.021) + 0.5 * Math.sin(time * 0.057 + 1.3) + 0.15 * storm * Math.sin(time * 0.9)
    wind.strength = Math.min(1, Math.max(0.05, WIND.calm + (1 - WIND.calm) * storm + 0.1 * Math.sin(time * 0.7) + 0.07 * Math.sin(time * 1.9 + 2)))
  }
  return wind
}
