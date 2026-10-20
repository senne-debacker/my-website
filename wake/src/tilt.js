import { TILT } from './config.js'

// Tilt steering: turn the phone like a steering wheel and the boat turns the same way. The joystick
// stays for the throttle (up / down); with tilt on, its left / right does nothing. The player picks
// "Joystick" or "Tilt" in the .ctrl-mode switches (start screen and pause screen, touch mode only);
// the choice is saved.
//
// The angle comes from the direction of gravity seen from the screen, so it is the same in
// portrait and landscape, either way round, on iOS and Android (deviceorientation is standardised;
// devicemotion's sign differs between the two). The neutral angle is whatever the phone was held at
// when the game started or resumed (`calibrate`), so it does not matter how you hold it.

const RAD = Math.PI / 180
const STORAGE_KEY = 'wake.controls'
const wrap = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle)) // to -PI..PI

// Where "up" (against gravity) points on the screen, from deviceorientation angles (degrees; the
// W3C rotation Rz(alpha) Rx(beta) Ry(gamma) gives up in device coordinates = (-sin g cos b, sin b, cos g cos b))
// and the screen's rotation (`screen.orientation.angle`: how far the device is turned counter-clockwise
// from its natural position). Returns { roll, strength }: roll = how far "up" leans to the right on
// the screen (radians; 0 = upright), strength = how much of gravity lies in the screen plane (0 = flat).
export function screenRoll(betaDeg, gammaDeg, screenAngleDeg) {
  const b = betaDeg * RAD
  const g = gammaDeg * RAD
  const a = screenAngleDeg * RAD
  const ux = -Math.sin(g) * Math.cos(b)
  const uy = Math.sin(b)
  const sx = ux * Math.cos(a) - uy * Math.sin(a) // screen right in device coordinates = (cos a, -sin a)
  const sy = ux * Math.sin(a) + uy * Math.cos(a) // screen up = (sin a, cos a)
  return { roll: Math.atan2(sx, sy), strength: Math.hypot(sx, sy) }
}

// Helm -1..1 from the roll and the neutral roll. Turning the phone clockwise (the wheel to starboard)
// makes "up" lean left on the screen, so the helm is the negative of the roll change.
export function steerFromRoll(roll, neutral, tilt = TILT) {
  const degrees = wrap(neutral - roll) / RAD
  const t = Math.min(1, Math.max(0, (Math.abs(degrees) - tilt.deadDeg) / (tilt.fullDeg - tilt.deadDeg)))
  return Math.sign(degrees) * t
}

const loadMode = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'tilt' ? 'tilt' : 'stick'
  } catch {
    return 'stick'
  }
}

export function setupTilt(interaction, { notify = () => {} } = {}) {
  const tilt = interaction.tilt // { active, value }: read by interaction.js and touch.js
  const groups = [...document.querySelectorAll('.ctrl-mode')]
  const stickElement = document.getElementById('stick')
  let mode = loadMode() // what the player chose
  let ready = false // the sensor is listening and has delivered readings
  let pending = null // a permission request / sensor check in progress
  let got = false
  let roll = 0
  let strength = 0
  let neutral = 0
  let note = ''

  const screenAngle = () => screen.orientation?.angle ?? Number(window.orientation) ?? 0
  const onOrientation = (event) => {
    if (event.beta == null || event.gamma == null) return // desktops fire one empty event
    got = true
    ;({ roll, strength } = screenRoll(event.beta, event.gamma, screenAngle()))
  }

  // Asks for the sensor (iOS shows a permission dialog; this must run inside a tap) and waits for a
  // first reading. Resolves to '' when it works, else to the reason it does not.
  function prepare() {
    if (ready) return Promise.resolve('')
    if (pending) return pending
    pending = (async () => {
      if (typeof DeviceOrientationEvent === 'undefined') return 'This device has no motion sensor.'
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return 'Motion access was denied. Allow it in the browser settings.'
        } catch {
          return 'Motion access was denied. Allow it in the browser settings.'
        }
      }
      got = false
      addEventListener('deviceorientation', onOrientation)
      for (let i = 0; i < 12 && !got; i++) await new Promise((resolve) => setTimeout(resolve, 100))
      if (!got) {
        removeEventListener('deviceorientation', onOrientation)
        return 'This device has no motion sensor.'
      }
      ready = true
      return ''
    })().finally(() => (pending = null))
    return pending
  }

  function calibrate() {
    if (ready && strength >= TILT.minGravity) neutral = roll
  }

  function refresh() {
    tilt.active = mode === 'tilt' && ready
    document.body.classList.toggle('tilt-steer', tilt.active)
    for (const group of groups) {
      for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode))
      group.querySelector('.ctrl-note').textContent = note
    }
    const hint = tilt.active ? 'Tilt the phone to steer, drag the stick for speed' : 'Drag the stick to steer and sail'
    for (const element of document.querySelectorAll('[data-stick-hint]')) element.textContent = hint
  }

  // Falls back to the joystick, with the reason shown under the switch.
  const fail = (reason) => {
    mode = 'stick'
    note = reason
    save()
    refresh()
    notify(reason)
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      /* private mode: the choice just does not persist */
    }
  }

  async function setMode(next) {
    mode = next
    note = ''
    save()
    if (next === 'tilt') {
      note = 'Checking the motion sensor...'
      refresh()
      const reason = await prepare() // (called straight from the tap: iOS only asks for permission there)
      if (mode !== 'tilt') return // changed their mind meanwhile
      if (reason) return fail(reason)
      note = 'Hold the phone as you like, then turn it like a wheel.'
      calibrate()
    }
    refresh()
  }

  for (const group of groups) {
    for (const button of group.querySelectorAll('button')) button.addEventListener('click', () => setMode(button.dataset.mode))
  }

  // Called from the "Set sail" / "Resume" taps: a saved choice of tilt needs the permission again in
  // a new session on iOS; the neutral angle is taken from how the phone is held right now.
  function begin() {
    if (mode !== 'tilt') return
    const wasReady = ready
    prepare().then((reason) => {
      if (reason && mode === 'tilt') return fail(reason)
      refresh()
      if (!wasReady) calibrate()
    })
    calibrate()
  }

  let value = 0
  function update(delta) {
    if (!tilt.active || !interaction.enabled) {
      value = 0
    } else {
      const target = strength >= TILT.minGravity ? steerFromRoll(roll, neutral) : 0
      value += (target - value) * (1 - Math.exp(-delta * TILT.response))
    }
    tilt.value = value
    stickElement?.style.setProperty('--steer', value.toFixed(3)) // (the CSS can read the helm)
  }

  refresh()
  return { begin, calibrate, update, setMode, get mode() { return mode } }
}
