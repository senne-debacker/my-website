import { DAY } from '../config.js'

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// The game clock: `timeOfDay` runs 0..1 (0 = midnight, 0.5 = noon) and wraps.
// One full day lasts DAY.length seconds; holding T fast-forwards.
export function createClock() {
  const clock = {
    timeOfDay: DAY.start,
    days: 0, // completed days since the start
    paused: false, // handy for debugging: `__game.clock.paused = true`

    update(delta, fastForward) {
      if (clock.paused) return
      const next = clock.timeOfDay + (delta / DAY.length) * (fastForward ? DAY.fastForward : 1)
      clock.days += Math.floor(next)
      clock.timeOfDay = next % 1
    },

    // "Monday, Day 1": the game starts on a Monday.
    dayLabel() {
      return `${WEEKDAYS[clock.days % 7]}, Day ${clock.days + 1}`
    },

    // "18:42"
    format() {
      const minutes = Math.floor(clock.timeOfDay * 24 * 60)
      const [h, m] = [Math.floor(minutes / 60) % 24, minutes % 60]
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    },
  }
  return clock
}
