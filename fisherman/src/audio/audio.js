import { BOAT } from '../config.js'
import { createMusic } from './music.js'

// All sound is synthesised with the Web Audio API: no sound files. Two kinds of sounds:
//
//   CONTINUOUS LAYERS (engine, hull wash, sea, rain) are always "playing" from the moment the
//   game starts, but their volume (and pitch / filter) is driven by the game state every frame:
//   the engine is silent at a standstill and grows with speed, the wash does the same, the sea
//   swells with the storm, the rain follows the rain level. Smooth changes use
//   AudioParam.setTargetAtTime, which glides towards a value instead of jumping (no clicks).
//
//   ONE-SHOTS (lamp, anchor, bump, horn) are small throw-away graphs started when something
//   happens: a burst of filtered noise and/or a pitched tone with a volume envelope.
//
// Browsers only allow sound after a user gesture, so nothing exists until `start()` is called
// from the click on the start button.

const STORAGE_KEY = 'fisherman.audio'

// The generated music (music.js) is switched off: only public/audio/music.mp3 is played.
// Set to true to play the generated music while the mp3 loads, or when there is no mp3.
const USE_GENERATED_MUSIC = false
const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x))
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}
  } catch {
    return {}
  }
}

export function createAudio() {
  const settings = { music: 0.5, sfx: 0.8, muted: false, ...loadSettings() }
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* private mode etc.: settings just do not persist */
    }
  }

  let ctx = null
  let paused = false
  let music = null
  let hornVoice = null
  const bus = {} // named gain nodes
  const layer = {} // the continuous layers
  const meters = {} // analysers, for the debug read-out
  let whiteNoise, brownNoise

  // ----- small building blocks -----------------------------------------------------------------

  const gain = (value = 1) => {
    const node = ctx.createGain()
    node.gain.value = value
    return node
  }

  const filter = (type, frequency, Q = 0.7) => {
    const node = ctx.createBiquadFilter()
    node.type = type
    node.frequency.value = frequency
    node.Q.value = Q
    return node
  }

  const meter = (name, node) => {
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    node.connect(analyser)
    meters[name] = { analyser, data: new Float32Array(analyser.fftSize) }
  }

  function createNoiseBuffers() {
    const length = ctx.sampleRate * 4
    whiteNoise = ctx.createBuffer(1, length, ctx.sampleRate)
    brownNoise = ctx.createBuffer(1, length, ctx.sampleRate)
    const white = whiteNoise.getChannelData(0)
    const brown = brownNoise.getChannelData(0)
    let last = 0
    for (let i = 0; i < length; i++) {
      white[i] = Math.random() * 2 - 1
      last = (last + 0.02 * white[i]) / 1.02 // leaky integration = brown noise (deep rumble)
      brown[i] = last * 3.5
    }
  }

  const loopNoise = (buffer) => {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.start(0, Math.random() * 3)
    return source
  }

  // A generated room: decaying noise as an impulse response, for a soft reverb tail.
  function createReverb() {
    const seconds = 2.8
    const length = Math.floor(ctx.sampleRate * seconds)
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
    }
    const convolver = ctx.createConvolver()
    convolver.buffer = impulse
    return convolver
  }

  // ----- one-shot helpers ------------------------------------------------------------------------

  // A burst of filtered noise with a falling volume.
  function noiseBurst({ when = 0, duration = 0.1, type = 'bandpass', frequency = 2000, endFrequency, Q = 1, volume = 0.3, attack = 0.002, to = bus.sfx }) {
    const t = ctx.currentTime + when
    const source = ctx.createBufferSource()
    source.buffer = whiteNoise
    const f = filter(type, frequency, Q)
    if (endFrequency) f.frequency.exponentialRampToValueAtTime(endFrequency, t + duration)
    const g = gain(0.0001)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(volume, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    source.connect(f).connect(g).connect(to)
    source.start(t, Math.random() * 3)
    source.stop(t + duration + 0.05)
  }

  // A pitched tone that glides from `frequency` to `endFrequency`.
  function tone({ when = 0, duration = 0.2, type = 'sine', frequency = 200, endFrequency, volume = 0.3, attack = 0.004, to = bus.sfx }) {
    const t = ctx.currentTime + when
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequency, t)
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, t + duration)
    const g = gain(0.0001)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(volume, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(g).connect(to)
    osc.start(t)
    osc.stop(t + duration + 0.05)
  }

  // ----- the graph --------------------------------------------------------------------------------

  function buildGraph() {
    const compressor = ctx.createDynamicsCompressor() // keeps loud moments (horn + storm) from clipping
    compressor.threshold.value = -14
    compressor.ratio.value = 6
    bus.master = gain(settings.muted ? 0 : 1)
    bus.master.connect(compressor).connect(ctx.destination)
    meter('master', bus.master)

    bus.music = gain(settings.music)
    bus.music.connect(bus.master)
    meter('music', bus.music)
    bus.sfx = gain(settings.sfx)
    bus.sfx.connect(bus.master)

    // Environment sounds go through a low-pass and a volume that close down in planet view
    // (as if you flew out of the atmosphere) and when the game is paused.
    bus.env = gain(1)
    bus.envFilter = filter('lowpass', 20000, 0.5)
    bus.env.connect(bus.envFilter).connect(bus.sfx)

    bus.reverb = createReverb()
    bus.reverbLevel = gain(0.45)
    bus.reverb.connect(bus.reverbLevel).connect(bus.master)
    bus.reverbSend = gain(1) // anything connected here gets reverb
    bus.reverbSend.connect(bus.reverb)

    createNoiseBuffers()
    buildEngine()
    buildWater()
    buildRain()
    music = createMusic(ctx, bus.music, bus.reverbSend)
  }

  // A small diesel: low saw + triangle + sub sine, a "chug" (amplitude wobble that speeds up with
  // the revs), noise for the exhaust, all through a low-pass that opens as the engine speeds up.
  function buildEngine() {
    const e = (layer.engine = {})
    e.saw = ctx.createOscillator()
    e.saw.type = 'sawtooth'
    e.tri = ctx.createOscillator()
    e.tri.type = 'triangle'
    e.sub = ctx.createOscillator()
    e.sub.type = 'sine'
    const mix = gain(0.3)
    for (const osc of [e.saw, e.tri, e.sub]) {
      osc.connect(mix)
      osc.start()
    }
    const exhaust = filter('bandpass', 180, 0.8)
    const exhaustLevel = gain(0.22)
    loopNoise(whiteNoise).connect(exhaust).connect(exhaustLevel).connect(mix)

    e.chug = gain(0.65)
    e.chugLfo = ctx.createOscillator()
    const chugDepth = gain(0.35)
    e.chugLfo.connect(chugDepth).connect(e.chug.gain)
    e.chugLfo.start()

    e.filter = filter('lowpass', 150, 1)
    e.out = gain(0)
    mix.connect(e.chug).connect(e.filter).connect(e.out).connect(bus.env)
    meter('engine', e.out)
  }

  // Water: a constant gentle sea (deep noise with a slow swell that grows in storms), and the
  // wash along the hull, which is silent at a standstill and grows and brightens with speed.
  function buildWater() {
    const s = (layer.sea = {})
    s.out = gain(0.06)
    const deep = filter('lowpass', 420, 0.5)
    loopNoise(brownNoise).connect(deep).connect(s.out).connect(bus.env)
    s.swell = ctx.createOscillator()
    s.swell.frequency.value = 0.11
    s.swellDepth = gain(0.03)
    s.swell.connect(s.swellDepth).connect(s.out.gain)
    s.swell.start()
    s.hiss = gain(0)
    loopNoise(whiteNoise).connect(filter('bandpass', 1400, 0.5)).connect(s.hiss).connect(bus.env)
    meter('sea', s.out)

    const w = (layer.wash = {})
    w.filter = filter('bandpass', 500, 0.6)
    w.out = gain(0)
    loopNoise(whiteNoise).connect(w.filter).connect(filter('lowpass', 3500, 0.5)).connect(w.out).connect(bus.env)
    meter('wash', w.out)
  }

  function buildRain() {
    const r = (layer.rain = {})
    r.out = gain(0)
    loopNoise(whiteNoise).connect(filter('highpass', 1400, 0.5)).connect(filter('bandpass', 4200, 0.35)).connect(r.out).connect(bus.env)
    r.patter = gain(0)
    loopNoise(brownNoise).connect(filter('lowpass', 800, 0.5)).connect(r.patter).connect(bus.env)
    meter('rain', r.out)
  }

  // ----- public API --------------------------------------------------------------------------------

  const api = {
    get started() {
      return ctx !== null
    },
    get settings() {
      return { ...settings }
    },
    get muted() {
      return settings.muted
    },

    // Must be called from a user gesture (the start button).
    async start() {
      if (ctx) return
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' })
      buildGraph()
      await ctx.resume()
      bus.music.gain.setValueAtTime(0, ctx.currentTime) // the music fades in while the camera swings round
      bus.music.gain.linearRampToValueAtTime(settings.music * (paused ? 0.4 : 1), ctx.currentTime + 3.5)
      if (USE_GENERATED_MUSIC) music.start()
      music.loadCustomTrack(new URL('audio/music.mp3', document.baseURI)) // optional: your own track replaces the generated music
    },

    // Continuous layers follow the game. Call every frame.
    //   speed  signed speed over the water   storm, rain  0..1 weather levels
    //   space  0..1, 1 = planet view          anchored  boolean
    update({ speed, storm, rain, space }) {
      if (!ctx) return
      const now = ctx.currentTime
      const f = clamp(Math.abs(speed) / BOAT.maxSpeed)
      const glide = (param, value, seconds) => param.setTargetAtTime(value, now, seconds)

      // Engine: off when standing still, fading in over the first part of the speed range, then
      // rising in volume, pitch, chug rate and brightness.
      const e = layer.engine
      const base = 34 + 46 * f
      glide(e.saw.frequency, base, 0.12)
      glide(e.tri.frequency, base * 2.01, 0.12)
      glide(e.sub.frequency, base * 0.5, 0.12)
      glide(e.chugLfo.frequency, 4.5 + 9.5 * f, 0.15)
      glide(e.filter.frequency, 150 + 1250 * f, 0.15)
      glide(e.out.gain, 0.55 * smoothstep(0, 0.12, f) * (0.35 + 0.65 * f ** 0.7), 0.25)

      // Water: sea level follows the storm; the wash follows speed (and the storm a little).
      const s = layer.sea
      glide(s.out.gain, 0.06 + 0.22 * storm, 0.6)
      glide(s.swellDepth.gain, 0.03 + 0.1 * storm, 0.6)
      glide(s.hiss.gain, 0.01 + 0.09 * storm ** 1.5, 0.6)
      const w = layer.wash
      glide(w.filter.frequency, 450 + 1500 * f, 0.2)
      glide(w.out.gain, 0.62 * f ** 1.1 * (1 + 0.5 * storm), 0.25)

      // Rain.
      glide(layer.rain.out.gain, 0.34 * rain ** 1.1, 0.5)
      glide(layer.rain.patter.gain, 0.2 * rain ** 1.2, 0.5)

      // Planet view: muffled and quieter, as if heard from outside the atmosphere. Pause: silent.
      glide(bus.envFilter.frequency, 450 + 19000 * (1 - space) ** 3, 0.3)
      glide(bus.env.gain, paused ? 0 : 1 - 0.7 * space, paused ? 0.1 : 0.4)
    },

    setPaused(value) {
      paused = value
      if (!ctx) return
      bus.music.gain.setTargetAtTime(settings.music * (paused ? 0.4 : 1), ctx.currentTime, 0.2)
      if (paused && hornVoice) this.horn(false)
    },

    setMusicVolume(value) {
      settings.music = clamp(value)
      save()
      if (ctx) bus.music.gain.setTargetAtTime(settings.music * (paused ? 0.4 : 1), ctx.currentTime, 0.1)
    },
    setSfxVolume(value) {
      settings.sfx = clamp(value)
      save()
      if (ctx) bus.sfx.gain.setTargetAtTime(settings.sfx, ctx.currentTime, 0.1)
    },
    setMuted(value) {
      settings.muted = value
      save()
      if (ctx) bus.master.gain.setTargetAtTime(value ? 0 : 1, ctx.currentTime, 0.08)
    },
    toggleMuted() {
      this.setMuted(!settings.muted)
      return settings.muted
    },

    // The bow lamp: a switch click. Higher and crisper going on, lower and duller going off.
    lamp(on) {
      if (!ctx) return
      noiseBurst({ duration: 0.04, frequency: on ? 3600 : 2300, Q: 3, volume: 0.7 })
      tone({ duration: 0.1, frequency: on ? 240 : 170, endFrequency: on ? 130 : 90, volume: 0.55 })
      tone({ when: 0.012, duration: 0.03, type: 'triangle', frequency: on ? 1900 : 1200, endFrequency: 800, volume: 0.08 })
    },

    // The anchor: a rattle of chain links (speeding up as it runs out, slowing as it comes in),
    // then a deep splash going down, or a creak coming up.
    anchor(down) {
      if (!ctx) return
      const links = down ? 16 : 22
      const span = down ? 1.15 : 1.5
      for (let i = 0; i < links; i++) {
        const progress = i / links
        const when = span * (down ? progress ** 0.75 : progress ** 1.35) + Math.random() * 0.02
        const pitch = 1700 + Math.random() * 1800
        noiseBurst({ when, duration: 0.05, frequency: pitch, Q: 9, volume: 0.1 + Math.random() * 0.14 })
        tone({ when, duration: 0.07, type: 'triangle', frequency: pitch * 0.62, endFrequency: pitch * 0.5, volume: 0.05 })
      }
      if (down) {
        noiseBurst({ when: span + 0.05, duration: 0.7, type: 'lowpass', frequency: 1400, endFrequency: 260, Q: 0.6, volume: 0.6, attack: 0.02 })
        tone({ when: span + 0.05, duration: 0.45, frequency: 95, endFrequency: 38, volume: 0.5 })
      } else {
        tone({ when: 0.05, duration: 1.1, type: 'sawtooth', frequency: 125, endFrequency: 80, volume: 0.035, attack: 0.15 })
      }
    },

    // Hitting a shore: a thump and a groan of timber, louder for harder hits.
    bump(strength = 0.5) {
      if (!ctx) return
      const s = clamp(strength, 0.25, 1)
      tone({ duration: 0.3, frequency: 150, endFrequency: 42, volume: 0.75 * s })
      noiseBurst({ duration: 0.22, type: 'lowpass', frequency: 800, endFrequency: 200, volume: 0.55 * s, Q: 0.7 })
      tone({ when: 0.04, duration: 0.4, type: 'sawtooth', frequency: 98, endFrequency: 62, volume: 0.07 * s, attack: 0.03 })
    },

    // The horn: two low sawtooth notes a fifth apart plus a triangle an octave up, with a slow
    // vibrato, low-passed to sound big and far away, sent into the reverb. Sounds while held.
    horn(on) {
      if (!ctx) return
      const now = ctx.currentTime
      if (on && !hornVoice) {
        const out = gain(0)
        const tone1 = filter('lowpass', 700, 0.8)
        tone1.frequency.linearRampToValueAtTime(1100, now + 0.5)
        const oscillators = [['sawtooth', 98], ['sawtooth', 147.2], ['triangle', 196]].map(([type, frequency]) => {
          const osc = ctx.createOscillator()
          osc.type = type
          osc.frequency.value = frequency
          osc.connect(tone1)
          return osc
        })
        const vibrato = ctx.createOscillator()
        vibrato.frequency.value = 5.2
        const vibratoDepth = gain(1.8)
        vibrato.connect(vibratoDepth)
        oscillators.forEach((osc) => vibratoDepth.connect(osc.frequency))
        tone1.connect(out)
        out.connect(bus.sfx)
        out.connect(bus.reverbSend)
        out.gain.setValueAtTime(0, now)
        out.gain.linearRampToValueAtTime(0.24, now + 0.07) // a quick swell, like air reaching the horn
        meter('horn', out)
        oscillators.forEach((osc) => osc.start(now))
        vibrato.start(now)
        hornVoice = { out, oscillators, vibrato, startedAt: now }
      } else if (!on && hornVoice) {
        const voice = hornVoice
        hornVoice = null
        const end = Math.max(now, voice.startedAt + 0.45) // never shorter than a short toot
        voice.out.gain.setValueAtTime(voice.out.gain.value, end)
        voice.out.gain.linearRampToValueAtTime(0, end + 0.4)
        voice.oscillators.forEach((osc) => osc.stop(end + 0.45))
        voice.vibrato.stop(end + 0.45)
      }
    },

    // RMS level of each layer (0..1): used by the dev tools to check the mix without listening.
    levels() {
      const result = { contextTime: ctx?.currentTime ?? 0, state: ctx?.state ?? 'none' }
      for (const [name, { analyser, data }] of Object.entries(meters)) {
        analyser.getFloatTimeDomainData(data)
        let sum = 0
        for (const x of data) sum += x * x
        result[name] = +Math.sqrt(sum / data.length).toFixed(4)
      }
      return result
    },
  }
  return api
}
