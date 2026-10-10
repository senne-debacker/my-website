import { LIGHTNING } from '../config.js'

const random = (range) => range[0] + Math.random() * (range[1] - range[0])

// Lightning during storms: a countdown to the next strike that only runs while the storm is
// fully on (heavy rain and high seas), each strike a few quick flickers. `flash` (0..1) is what the
// atmosphere adds to the sky, the haze, the clouds and the light from above; `thunder` is called
// with the delay in seconds before the rumble arrives (sound is slower than light).
//
//   update(delta, weather, active)   call every frame; `active` = the game is running
//   strike()                         trigger one now (debug)
//   flash                            current brightness
export function createLightning({ onStrike } = {}) {
  let wait = random(LIGHTNING.firstWait)
  let age = Infinity // seconds since the current strike began
  let brightness = 1
  let pulses = []
  const lightning = {
    flash: 0,
    hold: 0, // dev only: keeps the flash at this level (for screenshots)

    strike() {
      age = 0
      brightness = random(LIGHTNING.brightness)
      // Two or three flickers, each a quick rise and a fast fade.
      pulses = [{ at: 0, level: 1 }, { at: random([0.1, 0.18]), level: random([0.4, 0.8]) }]
      if (Math.random() < 0.5) pulses.push({ at: random([0.26, 0.4]), level: random([0.6, 1]) })
      onStrike?.(random(LIGHTNING.thunderDelay), brightness)
    },

    update(delta, weather, active) {
      const stormy = weather.rain > LIGHTNING.minRain && weather.storm > LIGHTNING.minStorm
      if (active && stormy) {
        wait -= delta
        if (wait <= 0) {
          lightning.strike()
          wait = random(LIGHTNING.interval)
        }
      } else if (!stormy) wait = Math.max(wait, random(LIGHTNING.firstWait)) // the next storm starts with a short pause

      age += delta
      let flash = 0
      for (const { at, level } of pulses) {
        const t = age - at
        if (t < 0) continue
        flash = Math.max(flash, level * Math.min(1, t / LIGHTNING.rise) * Math.exp(-t / LIGHTNING.fade))
      }
      lightning.flash = Math.max(flash * brightness, lightning.hold)
    },
  }
  return lightning
}
