// Two overlays (markup in index.html, look in style.css):
//   #start  the start screen: title, five key hints and the "Set sail" button. Everything else
//           is the 3D scene behind it, a close-up of the boat
//   #menu   the pause screen: every control, the two volume sliders and "Resume"
// Enter presses whichever button is showing.
export function createMenu({ audio, onStart, onResume, onMute }) {
  const $ = (id) => document.getElementById(id)
  const start = $('start')
  const startButton = $('start-action')
  const pause = $('menu')
  const resumeButton = $('menu-action')
  const music = $('volume-music')
  const effects = $('volume-sfx')

  music.value = audio.settings.music
  effects.value = audio.settings.sfx
  music.addEventListener('input', () => audio.setMusicVolume(Number(music.value)))
  effects.addEventListener('input', () => audio.setSfxVolume(Number(effects.value)))

  const soundButton = $('sound-button')
  soundButton.addEventListener('click', () => {
    onMute()
    soundButton.blur() // otherwise Space or Enter would press it again
  })

  startButton.addEventListener('click', () => onStart())
  resumeButton.addEventListener('click', () => onResume())

  addEventListener('keydown', (event) => {
    if (event.code !== 'Enter') return
    if (start.classList.contains('show') && !start.classList.contains('leaving') && document.activeElement !== startButton) {
      event.preventDefault()
      onStart()
    } else if (pause.classList.contains('show') && document.activeElement !== resumeButton) {
      event.preventDefault()
      onResume()
    }
  })

  return {
    // The Sound button is shown on the start and pause screens.
    showSound(visible) {
      document.body.classList.toggle('show-sound', visible)
    },
    showStart() {
      start.classList.remove('leaving')
      start.classList.add('show')
      startButton.focus({ preventScroll: true })
    },
    // Fades the start screen out (the camera is swinging round behind the boat meanwhile).
    hideStart() {
      start.classList.add('leaving')
      startButton.blur()
      setTimeout(() => start.classList.remove('show', 'leaving'), 900)
    },
    openPause() {
      pause.classList.add('show')
      resumeButton.focus({ preventScroll: true })
    },
    closePause() {
      pause.classList.remove('show')
      resumeButton.blur()
    },
  }
}
