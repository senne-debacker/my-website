import { FISHING } from '../config.js'
import { RARITIES, rollFish, rollWeight, formatWeight } from './fishDatabase.js'

// The fishing minigame: hold to reel in, let go to ease the line.
//
//   Progress  fills slowly while the reel is held and slips back a little while it is not
//   Tension   fills quickly while held and drains quickly when released
//   Tension reaches 100%   the line snaps (you lose the fish)
//   Progress reaches 100%  the fish is caught (if both happen in one frame, you get the fish)
//
// So holding all the time never works: you reel in bursts and let the line rest in between. Now and
// then the fish pulls (extra tension for a moment, announced just before), which punishes holding
// at the wrong time. The numbers are in config.js (FISHING.fight). `difficulty` makes the fish
// riskier rather than slower to land: above 1 the tension rises faster (so the bursts are shorter
// and there is less room for a late reaction), the pulls are harder and a little more frequent.
//
// This file has two halves. createFight / stepFight are the rules, plain functions with no DOM, so
// tests/fishing.check.mjs can play them. createFishingMinigame is the interface around them
// (markup in index.html under #fishing, look in style.css): a requestAnimationFrame loop that feeds
// the held state into stepFight and draws the two bars.

// ---- The rules -----------------------------------------------------------------------------------

const clamp01 = (x) => Math.min(1, Math.max(0, x))

function secondsToNextPull(fight) {
  const { thrash } = FISHING.fight
  if (!thrash) return Infinity
  const [min, max] = thrash.every
  return (min + (max - min) * fight.random()) / Math.sqrt(fight.difficulty)
}

// A fresh fight. `random` is any () => [0, 1) (Math.random, or a seeded one for the checks).
export function createFight(difficulty = 1, random = Math.random) {
  const fight = {
    difficulty,
    random,
    outcome: 'playing', // 'playing' | 'caught' | 'snapped'
    progress: 0, // 0..1
    tension: 0, // 0..1
    time: 0, // seconds since the fish took the bait
    pullIn: 0, // seconds until the next pull
    pullLeft: 0, // seconds left of the pull that is going on
    warning: false, // a pull is about to start (for the interface)
    pulling: false, // a pull is going on (for the interface)
  }
  fight.pullIn = secondsToNextPull(fight)
  return fight
}

// Advances the fight by `dt` seconds with the reel held or not. Returns (and stores) the outcome.
export function stepFight(fight, holding, dt) {
  if (fight.outcome !== 'playing') return fight.outcome
  const { progressRate, progressSlip, tensionRise, tensionFall, thrash } = FISHING.fight
  const hard = fight.difficulty
  fight.time += dt

  // The fish's pulls: a countdown, then a short burst of extra tension.
  let pull = 0
  if (thrash) {
    if (fight.pullLeft > 0) {
      fight.pullLeft -= dt
      pull = thrash.pull * hard
      if (fight.pullLeft <= 0) fight.pullIn = secondsToNextPull(fight)
    } else {
      fight.pullIn -= dt
      if (fight.pullIn <= 0) fight.pullLeft = thrash.duration
    }
    fight.pulling = fight.pullLeft > 0
    fight.warning = !fight.pulling && fight.pullIn < thrash.warn
  }

  fight.tension = clamp01(fight.tension + ((holding ? tensionRise * hard : -tensionFall) + pull) * dt)
  fight.progress = clamp01(fight.progress + (holding ? progressRate : -progressSlip) * dt)

  if (fight.progress >= 1) fight.outcome = 'caught'
  else if (fight.tension >= 1) fight.outcome = 'snapped'
  return fight.outcome
}

// ---- The interface -------------------------------------------------------------------------------

const HINTS = {
  idle: 'Hold to reel in',
  reeling: 'Reeling in...',
  danger: 'The line is straining. Let go!',
  warning: 'It is about to pull. Let go!',
  pulling: 'It is pulling!',
}
const ENDING_DELAY = 0.45 // s the bars stay on screen after the last frame of the fight
const RESULT_LOCK = 0.6 // s after the result card appears before a key press can dismiss it

// Options:
//   logbook    (optional) where catches are recorded: needs record({ id, weight }) -> { isNew, isRecord }
//   onResult   ({ outcome, fish, weight, isNew, isRecord }) when the fight ends. outcome is
//              'caught', 'snapped' or 'released' (the player gave up with Esc / "Let it go")
//   onClose    () when the interface has gone away again (after the result card was dismissed)
//   onFrame    ({ holding, tension, progress, pulling, warning }) every frame of the fight (for the sound)
// Returns { open, abort, isOpen }. `open({ difficulty, fish })` starts a fight; with `fish` (rolled
// beforehand, hidden from the player) the difficulty follows that fish's rarity and the same fish
// is what you land. Without it, the fish is rolled at the moment of the catch.
export function createFishingMinigame({ logbook = null, onResult, onClose, onFrame, random = Math.random } = {}) {
  const $ = (id) => document.getElementById(id)
  const root = $('fishing')
  const fightCard = $('fishing-fight')
  const resultCard = $('fishing-result')
  const reel = $('fishing-reel')
  const hint = $('fishing-hint')
  const bar = (id) => {
    const element = $(id)
    return { element, fill: element.querySelector('.meter-fill'), value: element.querySelector('.meter-value') }
  }
  const progress = bar('meter-progress')
  const tension = bar('meter-tension')
  tension.element.style.setProperty('--danger', FISHING.fight.danger)

  let phase = 'idle' // idle -> fight -> ending -> result -> idle
  let fight = null
  let chosen = null // the fish rolled beforehand, if any
  let keyHeld = false
  let pointerHeld = false
  let frame = 0
  let last = 0
  let timer = 0
  let shownAt = 0
  const shown = {} // what the DOM shows now: only changed values are written
  const change = (key, value, apply) => {
    if (shown[key] === value) return
    shown[key] = value
    apply(value)
  }

  function render() {
    progress.fill.style.transform = `scaleX(${fight.progress.toFixed(3)})`
    tension.fill.style.transform = `scaleX(${fight.tension.toFixed(3)})`
    fightCard.style.setProperty('--tension', fight.tension.toFixed(3))
    const holding = keyHeld || pointerHeld
    const danger = fight.tension >= FISHING.fight.danger
    change('progress', Math.round(fight.progress * 100), (v) => {
      progress.value.textContent = `${v}%`
      progress.element.setAttribute('aria-valuenow', v)
    })
    change('tension', Math.round(fight.tension * 100), (v) => {
      tension.value.textContent = `${v}%`
      tension.element.setAttribute('aria-valuenow', v)
    })
    change('danger', danger, (v) => tension.element.classList.toggle('danger', v))
    change('pulling', fight.pulling, (v) => fightCard.classList.toggle('pulling', v))
    change('warning', fight.warning, (v) => fightCard.classList.toggle('warning', v))
    change('held', holding, (v) => reel.classList.toggle('held', v))
    const mood = fight.pulling ? 'pulling' : fight.warning ? 'warning' : danger ? 'danger' : holding ? 'reeling' : 'idle'
    change('hint', mood, (v) => (hint.textContent = HINTS[v]))
  }

  function tick(now) {
    const delta = Math.min((now - last) / 1000, 0.1) // clamp after a tab switch
    last = now
    const outcome = stepFight(fight, keyHeld || pointerHeld, delta)
    render()
    onFrame?.({ holding: keyHeld || pointerHeld, tension: fight.tension, progress: fight.progress, pulling: fight.pulling, warning: fight.warning })
    if (outcome === 'playing') frame = requestAnimationFrame(tick)
    else endFight(outcome)
  }

  function endFight(outcome) {
    cancelAnimationFrame(frame)
    keyHeld = pointerHeld = false
    change('held', false, (v) => reel.classList.toggle('held', v))
    if (outcome === 'released') {
      onResult?.({ outcome })
      finish()
      return
    }
    phase = 'ending'
    timer = setTimeout(() => showResult(outcome), ENDING_DELAY * 1000)
  }

  function showResult(outcome) {
    phase = 'result'
    shownAt = performance.now()
    const caught = outcome === 'caught'
    const result = { outcome }
    if (caught) {
      const fish = chosen ?? rollFish(random)
      const weight = rollWeight(fish, random)
      Object.assign(result, { fish, weight }, logbook?.record({ id: fish.id, weight }) ?? { isNew: false, isRecord: false })
      resultCard.style.setProperty('--rarity', RARITIES[fish.rarity].colour)
      $('result-image').innerHTML = fish.imgUrl // our own static SVG strings (fishDatabase.js)
      $('result-name').textContent = fish.name
      $('result-rarity').textContent = RARITIES[fish.rarity].label
      $('result-weight').textContent = formatWeight(weight)
      $('result-text').textContent = fish.description
      $('result-new').hidden = !result.isNew
      $('result-record').hidden = !result.isRecord
    }
    $('result-title').textContent = caught ? 'Caught!' : 'The line snapped'
    resultCard.classList.toggle('caught', caught)
    resultCard.classList.toggle('snapped', !caught)
    fightCard.classList.remove('show')
    resultCard.classList.add('show')
    root.classList.add('result')
    $('fishing-continue').focus({ preventScroll: true })
    onResult?.(result)
  }

  function finish(notify = true) {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    phase = 'idle'
    fight = chosen = null
    keyHeld = pointerHeld = false
    removeEventListener('keydown', onKeyDown, true)
    removeEventListener('keyup', onKeyUp, true)
    removeEventListener('blur', onBlur)
    $('fishing-continue').blur()
    root.classList.remove('show', 'result')
    fightCard.classList.remove('show', 'pulling', 'warning')
    resultCard.classList.remove('show')
    document.body.classList.remove('fishing-open')
    if (notify) onClose?.()
  }

  // The fishing keys are handled in the capture phase and stopped there, so that while the
  // interface is open Space (reel / continue) and Esc never reach interaction.js, where Space would
  // lift the anchor and Esc would open the pause screen. Other keys (M for mute, say) pass.
  const stop = (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  function onKeyDown(event) {
    const space = event.code === 'Space'
    const enter = event.code === 'Enter'
    const escape = event.code === 'Escape'
    if (!space && !enter && !escape) return
    if (phase === 'fight') {
      if (space) {
        stop(event)
        if (!event.repeat) keyHeld = true // the press that dropped the anchor does not count: it was released or is auto-repeating
      } else if (escape) {
        stop(event)
        endFight('released')
      }
    } else {
      stop(event)
      if (phase === 'result' && !event.repeat && performance.now() - shownAt > RESULT_LOCK * 1000) finish()
    }
  }
  function onKeyUp(event) {
    if (event.code !== 'Space') return
    stop(event)
    keyHeld = false
  }
  const onBlur = () => {
    keyHeld = pointerHeld = false
  }

  // The on-screen reel button works with a mouse or a finger, and as long as it is held.
  reel.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    if (phase !== 'fight') return
    pointerHeld = true
    reel.setPointerCapture(event.pointerId)
  })
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) reel.addEventListener(type, () => (pointerHeld = false))
  reel.addEventListener('contextmenu', (event) => event.preventDefault()) // no menu on a long press
  $('fishing-release').addEventListener('click', () => phase === 'fight' && endFight('released'))
  $('fishing-continue').addEventListener('click', () => phase === 'result' && finish())

  return {
    get isOpen() {
      return phase !== 'idle'
    },

    open({ difficulty, fish = null } = {}) {
      if (phase !== 'idle') return
      chosen = fish
      fight = createFight(difficulty ?? (fish ? RARITIES[fish.rarity].difficulty : 1), random)
      phase = 'fight'
      keyHeld = pointerHeld = false
      for (const key of Object.keys(shown)) delete shown[key]
      render()
      root.classList.remove('result')
      resultCard.classList.remove('show')
      fightCard.classList.add('show')
      root.classList.add('show')
      document.body.classList.add('fishing-open') // hides the touch pads: the reel button is the thumb target now
      addEventListener('keydown', onKeyDown, true)
      addEventListener('keyup', onKeyUp, true)
      addEventListener('blur', onBlur)
      last = performance.now()
      frame = requestAnimationFrame(tick)
    },

    // Closes everything at once without a result (and without onClose: the caller asked for it).
    abort() {
      if (phase !== 'idle') finish(false)
    },
  }
}
