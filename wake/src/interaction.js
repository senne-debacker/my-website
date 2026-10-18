const WEATHER_KEYS = { Digit1: 'calm', Digit2: 'breezy', Digit3: 'storm', Digit4: 'auto' }

const FORWARD = ['KeyW', 'ArrowUp']
const BACK = ['KeyS', 'ArrowDown']
const LEFT = ['KeyA', 'ArrowLeft']
const RIGHT = ['KeyD', 'ArrowRight']

// Keyboard -> game. `input` is read by the boat physics every frame:
//   throttle  -1..1   W / S
//   steer     -1..1   A / D (+1 = starboard), eased so a tap is a gentle turn
//   anchored  bool    Space or X toggles
//   lights    bool    L toggles the bow lamp
//   horn      bool    H, true while the key is held
//   planetView bool   C toggles the free planet camera
//   fastForward bool  hold T to speed up the day/night clock (developer mode only)
//   boost     bool    Shift, true while held
//   weather   'auto' | 'calm' | 'breezy' | 'storm'   keys 4 / 1 / 2 / 3 (developer mode only), read by world/weather.js
// App-level keys call back into main.js: Escape -> handlers.onMenu(), M -> handlers.onMute(),
// B -> handlers.onLogbook() (the fish logbook; only while sailing).
// While `interaction.enabled` is false (start screen, pause) only Escape works and the input
// settles to neutral.
export function setupInteraction(handlers = {}) {
  const down = new Set()
  const input = { throttle: 0, steer: 0, anchored: false, lights: false, horn: false, planetView: false, fastForward: false, boost: false, weather: 'auto' }
  const interaction = { input, enabled: true, dev: false, stick: { active: false, x: 0, y: 0 } } // stick: the touch joystick (touch.js) // dev: the weather keys and T work (set by devMode.js after the code was entered)

  // Which key was pressed? A letter key is identified by the letter printed on it
  // (event.key), so M is M on every keyboard layout; on an AZERTY keyboard the key labelled M is
  // physically where QWERTY has ";" and event.code would say "Semicolon". Everything else (digits,
  // Space, Escape, arrows) is identified by its physical position (event.code).
  const label = (event) => {
    if (/^[a-z]$/i.test(event.key)) return `Key${event.key.toUpperCase()}`
    // Punctuation printed on a letter position (AZERTY has "," where QWERTY has M) is not a letter key.
    if (event.code.startsWith('Key') && event.key.length === 1 && !/\p{L}/u.test(event.key)) return `Other${event.code}`
    return event.code // Space, digits, arrows, and letters of other alphabets (physical position)
  }

  // One place that knows what each control does, used by the keyboard and by the clickable HUD.
  // `key` is a label like 'KeyL', 'Space', 'Digit3' (see label() above).
  function press(key, code = key) {
    if (key === 'Escape') return handlers.onMenu?.()
    if (key === 'KeyM') return handlers.onMute?.() // works on every screen, not only while sailing
    if (!interaction.enabled) return
    // Movement keys are tracked by both the label and the position, so on an AZERTY keyboard
    // both the keys labelled WASD and the ones in the WASD position (labelled ZQSD) steer.
    down.add(code)
    down.add(key)

    if (interaction.dev && key in WEATHER_KEYS) input.weather = WEATHER_KEYS[key]
    if (key === 'Space' || key === 'KeyX') input.anchored = !input.anchored
    if (key === 'KeyL') input.lights = !input.lights
    if (key === 'KeyH') input.horn = true
    if (key === 'KeyC') input.planetView = !input.planetView
    if (key === 'KeyB') handlers.onLogbook?.()
  }
  function release(key, code = key) {
    down.delete(code)
    down.delete(key)
    if (key === 'KeyH') input.horn = false
  }
  interaction.press = press
  interaction.release = release

  addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement && event.code !== 'Escape') return // typing in / dragging a developer-panel control
    if (event.repeat) return // toggles must not flicker while a key is held
    if (event.ctrlKey || event.metaKey || event.altKey) return // leave browser shortcuts (Cmd+W, Ctrl+M ...) alone
    if (interaction.enabled && (event.code === 'Space' || event.code.startsWith('Arrow'))) event.preventDefault() // no page scrolling (menus keep the browser's key behaviour: Space presses a focused button, arrows move sliders)
    press(event.code === 'Escape' ? 'Escape' : label(event), event.code)
  })
  addEventListener('keyup', (event) => release(label(event), event.code))
  addEventListener('blur', () => {
    down.clear() // no stuck keys after alt-tab
    input.horn = false
    handlers.onBlur?.()
  })

  const axis = (positive, negative) =>
    (positive.some((code) => down.has(code)) ? 1 : 0) - (negative.some((code) => down.has(code)) ? 1 : 0)

  interaction.update = (delta) => {
    if (!interaction.enabled) {
      down.clear()
      input.horn = false
    }
    const analog = interaction.enabled && interaction.stick.active // the joystick replaces W S A D while a thumb is on it
    input.throttle = analog ? interaction.stick.y : axis(FORWARD, BACK)
    input.fastForward = interaction.dev && down.has('KeyT')
    input.boost = down.has('ShiftLeft') || down.has('ShiftRight')
    input.steer += ((analog ? interaction.stick.x : axis(RIGHT, LEFT)) - input.steer) * (1 - Math.exp(-delta * 8))
  }

  return interaction
}
