// Hides the mouse pointer after a few seconds without movement, like a video player, while
// `enabled` is true (the game is being played). Moving the mouse or pressing a mouse button
// brings it back. Menus and the pause screen always show it.
export function createCursorHider(seconds = 2.5) {
  let timer = 0
  let enabled = false
  const show = () => {
    document.body.classList.remove('cursor-hidden')
    clearTimeout(timer)
    if (enabled) timer = setTimeout(() => document.body.classList.add('cursor-hidden'), seconds * 1000)
  }
  addEventListener('mousemove', show)
  addEventListener('mousedown', show)
  addEventListener('wheel', show, { passive: true })
  return {
    setEnabled(value) {
      enabled = value
      show()
    },
  }
}
