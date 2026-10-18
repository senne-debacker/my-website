import { FISH_SPECIES } from './fishing/fishDatabase.js'

// Developer mode. The normal game has no way to force the weather or to run the clock: those keys
// (1 2 3 4, T) and everything else in here are locked. Open the page with `?dev`, type the code on the
// keypad and they unlock for this browser tab (sessionStorage); a small DEV tab then opens a panel with
// the weather, the clock and the fishing tools. This is a gate for players, not security: the code is
// in the source.
//
// Markup: #dev-gate (keypad), #dev-tab and #dev (panel) in index.html; look in style.css.

const CODE = '1815'
const STORAGE_KEY = 'wake.dev'

export function createDevMode({ interaction, clock, spots, logbook, startFishing, getState }) {
  const $ = (id) => document.getElementById(id)
  const gate = $('dev-gate')
  const panel = $('dev')
  const tab = $('dev-tab')
  const dots = [...$('dev-dots').children]
  const message = $('dev-message')
  let typed = ''
  let gateOpen = false
  let unlocked = false
  try {
    unlocked = sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // no storage: the code has to be typed on every load
  }

  const paintDots = () => dots.forEach((dot, i) => dot.classList.toggle('on', i < typed.length))

  function unlock() {
    unlocked = true
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // not remembered
    }
    apply()
  }

  // Everything that depends on being unlocked.
  function apply() {
    interaction.dev = unlocked
    document.body.classList.toggle('dev', unlocked)
    if (!unlocked) panel.classList.remove('show')
  }

  function closeGate() {
    if (!gateOpen) return
    gateOpen = false
    removeEventListener('keydown', onGateKey, true)
    gate.classList.remove('show')
  }

  function enter(digit) {
    if (typed.length >= 4) return
    typed += digit
    paintDots()
    if (typed.length < 4) return
    if (typed === CODE) {
      message.textContent = 'Unlocked'
      gate.classList.add('ok')
      unlock()
      setTimeout(() => {
        closeGate()
        gate.classList.remove('ok')
      }, 500)
    } else {
      message.textContent = 'Wrong code'
      gate.classList.add('wrong')
      setTimeout(() => {
        typed = ''
        paintDots()
        gate.classList.remove('wrong')
        message.textContent = 'Esc continues as a player'
      }, 600)
    }
  }
  function back() {
    typed = typed.slice(0, -1)
    paintDots()
  }

  // The gate swallows every key (in the capture phase) so nothing leaks into the game behind it.
  function onGateKey(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (/^[0-9]$/.test(event.key)) enter(event.key)
    else if (event.key === 'Backspace') back()
    else if (event.key === 'Escape') closeGate()
  }
  for (const button of gate.querySelectorAll('[data-digit]')) button.addEventListener('click', () => enter(button.dataset.digit))
  gate.querySelector('[data-action="back"]').addEventListener('click', back)
  gate.querySelector('[data-action="cancel"]').addEventListener('click', closeGate)

  // ---- the panel ------------------------------------------------------------------------------------
  const weatherButtons = [...panel.querySelectorAll('[data-weather]')]
  for (const button of weatherButtons) button.addEventListener('click', () => (interaction.input.weather = button.dataset.weather))
  const slider = $('dev-time')
  const freeze = $('dev-freeze')
  slider.addEventListener('input', () => (clock.timeOfDay = Number(slider.value) / 24))
  freeze.addEventListener('change', () => (clock.paused = freeze.checked))
  $('dev-refill').addEventListener('click', () => spots.refill())
  $('dev-fight').addEventListener('click', () => {
    const spot = spots.spots.find((s) => !s.empty) ?? spots.spots[0]
    if (spot && getState() === 'playing') {
      panel.classList.remove('show')
      startFishing(spot)
    }
  })
  $('dev-fill').addEventListener('click', () => FISH_SPECIES.forEach((fish) => logbook.record({ id: fish.id, weight: (fish.weight[0] + fish.weight[1]) / 2 })))
  $('dev-clear').addEventListener('click', () => logbook.reset())
  $('dev-lock').addEventListener('click', () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // nothing stored
    }
    unlocked = false
    clock.paused = false
    interaction.input.weather = 'auto'
    freeze.checked = false
    apply()
  })
  tab.addEventListener('click', () => panel.classList.toggle('show'))
  $('dev-close').addEventListener('click', () => panel.classList.remove('show'))
  addEventListener('keydown', (event) => {
    if (unlocked && event.code === 'Backquote' && !event.repeat && !gateOpen) panel.classList.toggle('show')
  })

  apply()
  let shownWeather = null
  let shownClock = null

  return {
    get unlocked() {
      return unlocked
    },
    // `?dev` in the address: ask for the code (unless this tab is unlocked already).
    begin() {
      if (!new URLSearchParams(location.search).has('dev') || unlocked || gateOpen) return
      gateOpen = true
      typed = ''
      paintDots()
      gate.classList.add('show')
      addEventListener('keydown', onGateKey, true)
    },
    // Every frame: keeps the panel in step with what the keys and the clock do.
    update() {
      if (!unlocked || !panel.classList.contains('show')) return
      const weather = interaction.input.weather
      if (weather !== shownWeather) {
        shownWeather = weather
        for (const button of weatherButtons) button.classList.toggle('on', button.dataset.weather === weather)
      }
      const hours = Math.round(clock.timeOfDay * 24 * 4) / 4
      if (hours !== shownClock && document.activeElement !== slider) {
        shownClock = hours
        slider.value = hours
      }
      $('dev-clock').textContent = clock.format()
      freeze.checked = clock.paused
    },
  }
}
