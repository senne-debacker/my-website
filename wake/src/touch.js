// Touch mode: on a phone or tablet the page gets a joystick and on-screen buttons and loses the
// keyboard hints. It is a class on <body> (`touch`), which style.css uses to show #touch and to hide
// everything that talks about keys. The buttons are ordinary HUD elements with `data-key`, so main.js
// wires them to the same actions as the keyboard; the joystick is setupStick() below.
//
// On when the main pointer is coarse (a finger) or after the first touch on the page; `?touch`
// forces it on and `?desktop` forces it off (for testing in a desktop browser).
export function setupTouchMode() {
  const params = new URLSearchParams(location.search)
  const set = (on) => {
    document.body.classList.toggle('touch', on)
    dispatchEvent(new Event('touchmode')) // hud.js rescales the interface
  }
  if (params.has('desktop')) return set(false)
  const coarse = matchMedia('(pointer: coarse)')
  set(params.has('touch') || coarse.matches)
  coarse.addEventListener?.('change', () => set(params.has('touch') || coarse.matches))
  // A device that does not report a coarse pointer (some tablets, hybrids) switches on the first touch.
  addEventListener('pointerdown', (event) => event.pointerType === 'touch' && set(true), { passive: true })
}

export const isTouch = () => document.body.classList.contains('touch')

// The joystick (#stick in index.html). Drag the knob: up / down is the throttle (analog, so a gentle
// push is a gentle throttle), left / right the helm. It writes `interaction.stick` = { active, x, y }
// with x, y in -1..1 (y up = forward), which interaction.js uses instead of the keys while it is held.
export function setupStick(interaction) {
  const element = document.getElementById('stick')
  const base = element.querySelector('.stick-base')
  const stick = interaction.stick
  const DEAD = 0.12 // a small play in the middle, so a resting thumb does nothing
  let pointer = null
  let cx = 0
  let cy = 0
  let reach = 1 // how far the knob can travel, px

  const reset = () => {
    pointer = null
    stick.active = false
    stick.x = stick.y = 0
    element.classList.remove('active')
    base.style.setProperty('--dx', '0px')
    base.style.setProperty('--dy', '0px')
  }
  const move = (event) => {
    let dx = interaction.tilt.active ? 0 : event.clientX - cx // with tilt steering the knob only slides up and down
    let dy = event.clientY - cy
    const length = Math.hypot(dx, dy)
    if (length > reach) {
      dx *= reach / length
      dy *= reach / length
    }
    base.style.setProperty('--dx', `${dx.toFixed(1)}px`)
    base.style.setProperty('--dy', `${dy.toFixed(1)}px`)
    // Outside the dead zone the value grows from 0 again, up to 1 at the edge.
    const shape = (v) => Math.sign(v) * Math.max(0, (Math.abs(v) - DEAD) / (1 - DEAD))
    stick.x = shape(dx / reach)
    stick.y = shape(-dy / reach)
  }

  element.addEventListener('pointerdown', (event) => {
    if (pointer !== null) return
    event.preventDefault()
    pointer = event.pointerId
    element.setPointerCapture(pointer)
    const rect = base.getBoundingClientRect()
    cx = rect.left + rect.width / 2 // the knob starts in the middle wherever the thumb lands
    cy = rect.top + rect.height / 2
    reach = rect.width * 0.34
    stick.active = true
    element.classList.add('active')
    move(event)
  })
  element.addEventListener('pointermove', (event) => event.pointerId === pointer && move(event))
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    element.addEventListener(type, (event) => event.pointerId === pointer && reset())
  }
  element.addEventListener('contextmenu', (event) => event.preventDefault())
  return reset
}
