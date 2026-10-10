// Touch mode: on a phone or tablet the page gets on-screen buttons and loses the keyboard hints.
// It is a class on <body> (`touch`), which style.css uses to show #touch (the pads) and to hide
// everything that talks about keys. The buttons themselves are ordinary HUD elements with
// `data-key`, so main.js wires them to the same actions as the keyboard.
//
// On when the main pointer is coarse (a finger) or after the first touch on the page; `?touch`
// forces it on and `?desktop` forces it off (for testing in a desktop browser).
export function setupTouchMode() {
  const params = new URLSearchParams(location.search)
  const set = (on) => document.body.classList.toggle('touch', on)
  if (params.has('desktop')) return set(false)
  const coarse = matchMedia('(pointer: coarse)')
  set(params.has('touch') || coarse.matches)
  coarse.addEventListener?.('change', () => set(params.has('touch') || coarse.matches))
  // A device that does not report a coarse pointer (some tablets, hybrids) switches on the first touch.
  addEventListener('pointerdown', (event) => event.pointerType === 'touch' && set(true), { passive: true })
}

export const isTouch = () => document.body.classList.contains('touch')
