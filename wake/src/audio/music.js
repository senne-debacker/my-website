// Background music: a slow, generative ambient piece, played with plain Web Audio oscillators.
//
// Four chords in D minor loop (Dm - Bb - F - Csus2), each held for 8 beats at 54 BPM (about 9 s).
// On top of the chord pads, a sparse melody is picked at random from the D minor pentatonic scale
// (D F G A C), a scale that sounds fine over all four chords, played as soft plucks with an echo.
// Nothing here is random in a way that can sound wrong, but it never repeats exactly.
//
// Prefer your own track? Put it at public/audio/music.mp3 (or .ogg) and `loadCustomTrack` will
// use it instead of the generated music.

const BPM = 54
const BEAT = 60 / BPM
const CHORDS = [
  { bass: 38, pad: [50, 57, 62, 65] }, // Dm: D2 | D3 A3 D4 F4
  { bass: 34, pad: [46, 53, 58, 62] }, // Bb: Bb1 | Bb2 F3 Bb3 D4
  { bass: 41, pad: [48, 53, 57, 60] }, // F:  F2 | C3 F3 A3 C4
  { bass: 36, pad: [48, 55, 60, 62] }, // Csus2: C2 | C3 G3 C4 D4
]
const BEATS_PER_CHORD = 8
const PENTATONIC = [62, 65, 67, 69, 72, 74, 77, 79] // D4 F4 G4 A4 C5 D5 F5 G5

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12)

export function createMusic(ctx, output, reverbSend) {
  let timer = null
  let nextBeat = 0
  let beatIndex = 0
  let melodyPosition = 3
  let custom = null // { source }

  // Echo for the plucks: a delay line with filtered feedback.
  const echo = ctx.createDelay(2)
  echo.delayTime.value = BEAT * 0.75
  const echoFeedback = ctx.createGain()
  echoFeedback.gain.value = 0.38
  const echoTone = ctx.createBiquadFilter()
  echoTone.type = 'lowpass'
  echoTone.frequency.value = 2200
  const echoLevel = ctx.createGain()
  echoLevel.gain.value = 0.55
  echo.connect(echoTone).connect(echoFeedback).connect(echo)
  echoTone.connect(echoLevel).connect(output)
  echoLevel.connect(reverbSend)

  function pad(note, when, length) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1300
    const gain = ctx.createGain()
    const attack = 2.4
    const release = 3.8
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(0.03, when + attack)
    gain.gain.setValueAtTime(0.03, when + length)
    gain.gain.linearRampToValueAtTime(0, when + length + release)
    filter.connect(gain).connect(output)
    gain.connect(reverbSend)
    for (const [type, cents] of [['sine', -5], ['triangle', 6]]) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = midiToHz(note)
      osc.detune.value = cents
      osc.connect(filter)
      osc.start(when)
      osc.stop(when + length + release + 0.1)
    }
  }

  function bass(note, when, length) {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, when)
    gain.gain.linearRampToValueAtTime(0.085, when + 1.2)
    gain.gain.setValueAtTime(0.085, when + length)
    gain.gain.linearRampToValueAtTime(0, when + length + 2.5)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = midiToHz(note)
    osc.connect(gain).connect(output)
    osc.start(when)
    osc.stop(when + length + 2.6)
  }

  function pluck(note, when, velocity) {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = midiToHz(note)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(3200, when)
    filter.frequency.exponentialRampToValueAtTime(700, when + 1.2)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(0.1 * velocity, when + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 1.9)
    const pan = ctx.createStereoPanner()
    pan.pan.value = (Math.random() - 0.5) * 0.7
    osc.connect(filter).connect(gain).connect(pan)
    pan.connect(output)
    pan.connect(echo)
    pan.connect(reverbSend)
    osc.start(when)
    osc.stop(when + 2)
  }

  function scheduleBeat(when) {
    const beatInChord = beatIndex % BEATS_PER_CHORD
    if (beatInChord === 0) {
      const chord = CHORDS[Math.floor(beatIndex / BEATS_PER_CHORD) % CHORDS.length]
      const length = BEATS_PER_CHORD * BEAT
      bass(chord.bass, when, length)
      chord.pad.forEach((note, i) => pad(note, when + i * 0.35, length)) // notes arrive one after another
    }
    // A pluck on about a third of the beats, stepping up or down the scale.
    if (Math.random() < 0.34) {
      melodyPosition = Math.min(PENTATONIC.length - 1, Math.max(0, melodyPosition + Math.floor(Math.random() * 5) - 2))
      pluck(PENTATONIC[melodyPosition], when + (Math.random() < 0.3 ? BEAT * 0.5 : 0), 0.5 + Math.random() * 0.5)
    }
    beatIndex++
  }

  function tick() {
    while (nextBeat < ctx.currentTime + 1.2) {
      scheduleBeat(nextBeat)
      nextBeat += BEAT
    }
  }

  return {
    get playing() {
      return timer !== null || custom !== null
    },

    start() {
      if (this.playing) return
      nextBeat = ctx.currentTime + 0.3
      timer = setInterval(tick, 250)
      tick()
    },

    stop() {
      clearInterval(timer)
      timer = null
      custom?.source.stop()
      custom = null
    },

    // Use a file instead of the generated music. Resolves true if a track was found and is playing.
    async loadCustomTrack(url) {
      try {
        const response = await fetch(url)
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !(type.startsWith('audio') || type.includes('ogg') || type.includes('octet-stream'))) return false
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer())
        clearInterval(timer)
        timer = null
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(output)
        source.start()
        custom = { source }
        return true
      } catch {
        return false // no custom track: keep the generated music
      }
    },
  }
}
