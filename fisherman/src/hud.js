import { Vector3 } from 'three/webgpu'

// The in-game interface, modelled on Dredge's: a ring that turns with the time of day with the
// anchor marker as "now", a pill with the day and the clock, a compass, diamond buttons for the
// lamp / anchor / horn with their keys, a stat box (speed and sea state) and a few key strips.
// The markup is in index.html, the look in style.css. Everything here only touches the DOM when a
// value actually changes.

const north = new Vector3()
const east = new Vector3()
const forward = new Vector3()

// Heading in degrees clockwise from north, where north is towards the planet's +Y pole.
export function compassHeading(boatState) {
  const { dir, heading } = boatState
  north.set(0, 1, 0).addScaledVector(dir, -dir.y)
  if (north.lengthSq() < 1e-4) north.set(1, 0, 0).addScaledVector(dir, -dir.x) // standing on a pole
  north.normalize()
  east.crossVectors(north, dir) // (east, north, up) is right-handed
  forward.copy(heading).addScaledVector(dir, -heading.dot(dir))
  return (Math.atan2(forward.dot(east), forward.dot(north)) * 180) / Math.PI
}

const RING = 92
const PHASES = [ // [start, end] as a fraction of the day, and the colour
  [0, 0.22, '#17233d'], // night
  [0.22, 0.3, '#e0855a'], // dawn
  [0.3, 0.7, '#cfe6ee'], // day
  [0.7, 0.8, '#d9764f'], // dusk
  [0.8, 1, '#17233d'], // night
]
const onRing = (t) => [RING * Math.sin(t * Math.PI * 2), -RING * Math.cos(t * Math.PI * 2)] // midnight at the top, noon at the bottom
const arc = (t0, t1) => {
  const [x0, y0] = onRing(t0)
  const [x1, y1] = onRing(t1)
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${RING} ${RING} 0 ${t1 - t0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
}

const seaState = (storm) => (storm < 0.2 ? ['Calm', 'good'] : storm < 0.5 ? ['Choppy', 'warn'] : storm < 0.8 ? ['Rough', 'bad'] : ['Stormy', 'bad'])

export function createHud() {
  const $ = (id) => document.getElementById(id)
  const root = $('hud')
  const cache = {}
  const change = (key, value, apply) => {
    if (cache[key] === value) return
    cache[key] = value
    apply(value)
  }

  // Colour the day ring.
  const phases = $('dial-phases')
  for (const [from, to, colour] of PHASES) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', arc(from, to))
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', colour)
    path.setAttribute('stroke-width', '7')
    phases.appendChild(path)
  }

  // Scale the interface with the window.
  const rescale = () => {
    const root = document.documentElement.style
    root.setProperty('--ui', Math.min(1.4, Math.max(0.7, innerHeight / 900)).toFixed(3))
    root.setProperty('--menu-scale', Math.min(1.15, Math.max(0.55, Math.min(innerHeight / 780, innerWidth / 820))).toFixed(3))
  }
  rescale()
  addEventListener('resize', rescale)

  let toastTimer = 0
  const toastElement = $('toast')

  return {
    show(visible) {
      root.classList.toggle('off', !visible) // fades in and out
    },

    // A short message under the dial.
    toast(text, seconds = 1.6) {
      toastElement.textContent = text
      toastElement.classList.add('show')
      clearTimeout(toastTimer)
      toastTimer = setTimeout(() => toastElement.classList.remove('show'), seconds * 1000)
    },

    update(s) {
      change('time', s.time, (v) => ($('dial-time').textContent = v))
      change('day', s.day, (v) => ($('dial-day').textContent = v))
      change('ring', Math.round(s.timeOfDay * 720), (v) => phases.setAttribute('transform', `rotate(${(180 - v / 2).toFixed(1)})`)) // "now" at the bottom
      change('compass', Math.round(-s.heading), (v) => ($('compass-dial').style.transform = `rotate(${v}deg)`))

      change('anchor', s.anchored, (v) => {
        $('dial-anchor').classList.toggle('down', v)
        $('tool-anchor').classList.toggle('on', v)
      })
      change('lamp', s.lights, (v) => $('tool-lamp').classList.toggle('on', v))
      change('horn', s.horn, (v) => $('tool-horn').classList.toggle('on', v))

      change('speed', Math.round(s.speed * 5), (v) => ($('stat-speed').textContent = v)) // 1 unit/s reads as 5 knots
      const [label, tone] = seaState(s.storm)
      change('sea', label, (v) => {
        const element = $('stat-sea')
        element.textContent = v
        element.className = tone
      })

      change('camera', s.camera, (v) => ($('camera-label').textContent = v === 'chase' ? 'Chase' : 'Planet'))
      change('muted', s.muted, (v) => {
        $('sound-icon').setAttribute('href', v ? '#i-muted' : '#i-speaker')
        $('strip-sound').classList.toggle('off', v)
        $('sound-button-icon').setAttribute('href', v ? '#i-muted' : '#i-speaker') // the button on the start and pause screens
        $('sound-button-label').textContent = v ? 'Sound off' : 'Sound on'
        $('sound-button').classList.toggle('off', v)
      })
      change('post', s.post, (v) => $('strip-effects').classList.toggle('off', !v))
    },
  }
}
