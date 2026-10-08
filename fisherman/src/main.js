import './style.css'
import {
  WebGPURenderer, Scene, PerspectiveCamera, Color, Vector3, ACESFilmicToneMapping,
} from 'three/webgpu'

import { PALETTE, INTRO } from './config.js'
import { uniforms } from './uniforms.js'
import { createPlanet } from './scene/planet.js'
import { createLighting } from './scene/lighting.js'
import { createBoat } from './scene/boat.js'
import { createSky } from './scene/sky.js'
import { createClouds } from './scene/clouds.js'
import { createRain } from './scene/rain.js'
import { createClock } from './world/clock.js'
import { createAtmosphere } from './world/atmosphere.js'
import { createWeather } from './world/weather.js'
import { createWake } from './world/wake.js'
import { createLayout } from './world/layout.js'
import { createWorld } from './scene/world.js'
import { createBoatState, createBoatPose, computeBoatPose } from './physics/boat.js'
import { createBoatDynamics, applyBoatWeight } from './physics/boatDynamics.js'
import { stepBoat } from './physics/boatMotion.js'
import { resolveCollisions } from './physics/collision.js'
import { createCameraRig } from './camera/cameraRig.js'
import { createHud, compassHeading } from './hud.js'
import { createMenu } from './menu.js'
import { createAudio } from './audio/audio.js'
import { createPostProcessing } from './post.js'
import { setupInteraction } from './interaction.js'

async function main() {
  // The assignment requires WebGPU. WebGPURenderer would silently fall back to
  // a WebGL2 backend, so refuse to start instead of hiding that.
  if (!navigator.gpu) {
    showError('navigator.gpu is undefined.')
    return
  }

  // --- Renderer ---------------------------------------------------------------
  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(innerWidth, innerHeight)
  renderer.toneMapping = ACESFilmicToneMapping
  document.querySelector('#app').appendChild(renderer.domElement)
  await renderer.init() // WebGPU adapter/device are requested asynchronously

  // --- Scene + camera ---------------------------------------------------------
  const scene = new Scene()
  scene.background = new Color(PALETTE.background)

  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200)

  const planet = createPlanet()
  const { sun, moon, fill } = createLighting()
  const boat = createBoat()
  const layout = createLayout() // where islands, rocks and buoys are (also used for collisions)
  const world = createWorld(layout)
  const sky = createSky()
  const clouds = createClouds()
  const rain = createRain()
  scene.add(sky.mesh, planet, world.group, clouds.group, rain.mesh, sun, moon, fill, boat.root)

  const clock = createClock()
  const weather = createWeather()
  const wake = createWake()
  const atmosphere = createAtmosphere({ scene, sun, moon, fill })
  let spaceAmount = 0 // 0 = chase camera (sky), 1 = planet view (space); eases between them

  const boatState = createBoatState(layout.start.dir, layout.start.heading)
  const boatPose = createBoatPose() // what the boat shows (heavy: filtered through springs)
  const waterPose = createBoatPose() // where a weightless object would sit on the waves
  const boatDynamics = createBoatDynamics()
  const placeBoat = (time, delta) => {
    computeBoatPose(boatState, time, uniforms.storm.value, waterPose)
    applyBoatWeight(boatDynamics, waterPose, boatState, delta, boatPose)
    boat.root.position.copy(boatPose.position)
    boat.root.quaternion.copy(boatPose.quaternion)
  }
  placeBoat(0, 0)

  const post = createPostProcessing(renderer, scene, camera)
  const rig = createCameraRig(camera, renderer.domElement, boatState)
  const hud = createHud()
  const audio = createAudio()
  atmosphere.update(clock.timeOfDay, boatState.dir, camera.position.length(), spaceAmount, weather.levels) // correct lighting from the first frame

  // --- Game state: start screen -> starting -> playing <-> paused -----------------------------------
  //   menu      the start screen: a close-up of the boat with the title over it
  //   starting  "Set sail" was pressed: the camera swings round to behind the boat
  //   playing   the game
  //   paused    the pause screen
  // Whenever it is not "playing", the game clock (`sim` below) is 0: the boat, the day and the
  // weather hold still, while the waves, the clouds and the boat's bobbing carry on, so the world
  // still looks alive behind the screens.
  let state = 'menu'
  function toggleSound() {
    const muted = audio.toggleMuted()
    if (state === 'playing') hud.toast(muted ? 'Sound off' : 'Sound on') // on the other screens the Sound button shows it
  }
  const interaction = setupInteraction({
    onMenu: () => (state === 'playing' ? setState('paused') : state === 'paused' ? setState('playing') : null),
    onMute: toggleSound,
    onBlur: () => state === 'playing' && setState('paused'),
  })
  const menu = createMenu({
    audio,
    onMute: toggleSound,
    onStart: () => {
      if (state !== 'menu') return
      audio.start() // browsers only allow sound after a click, so the audio engine is created here
      setState('starting')
      rig.pan(INTRO.panSeconds, () => setState('playing')) // swing round behind the boat, then sail
    },
    onResume: () => setState('playing'),
  })
  function setState(next) {
    state = next
    interaction.enabled = next === 'playing'
    hud.show(next === 'playing' || next === 'paused')
    menu.showSound(next === 'menu' || next === 'paused')
    if (next === 'menu') menu.showStart()
    if (next === 'starting') menu.hideStart()
    if (next === 'playing') menu.closePause()
    if (next === 'paused') menu.openPause()
    audio.setPaused(next === 'paused')
  }
  setState('menu')

  if (import.meta.env.DEV) window.__game = { boatState, boatPose, input: interaction.input, uniforms, lights: { sun, moon, fill }, clock, atmosphere, weather, layout, world, scene, camera, audio, getState: () => state } // for debugging in the console

  // `?parity` runs the GPU-vs-CPU wave comparison (see src/debug/parityTest.js).
  if (new URLSearchParams(location.search).has('parity')) {
    const { runParityTest } = await import('./debug/parityTest.js')
    await runParityTest(renderer)
  }

  // --- Loop -------------------------------------------------------------------
  let last = performance.now()
  let elapsed = 0
  let firstFrame = true
  let previous = { lights: false, anchored: false, horn: false }
  let bumpCooldown = 0
  let darkHinted = false

  renderer.setAnimationLoop((now) => {
    const delta = Math.min((now - last) / 1000, 0.1) // clamp after tab switches
    last = now
    elapsed += delta

    const { input } = interaction
    const playing = state === 'playing'
    const sim = playing ? delta : 0 // game time

    uniforms.time.value = elapsed // single clock shared with the water shader
    interaction.update(delta)
    weather.update(sim, input.weather) // storm / cover / rain levels; `storm` also drives the waves

    if (playing) {
      stepBoat(boatState, input, sim, elapsed) // engine, keel, helm, anchor
      const impact = resolveCollisions(boatState, layout.colliders, sim) // islands and rocks
      bumpCooldown = Math.max(0, bumpCooldown - sim)
      if (impact > 0.12 && bumpCooldown === 0) {
        audio.bump(impact)
        bumpCooldown = 0.5
        if (impact > 0.3) hud.toast('Bump!', 0.9)
      }
    }
    placeBoat(elapsed, delta) // CPU twin of the waves (same clock and weather as the shader), then the hull's weight
    boat.update(delta, input.lights, input.horn, elapsed)
    rig.update(delta, input.planetView, elapsed)

    clock.update(sim, input.fastForward)
    spaceAmount += ((input.planetView ? 1 : 0) - spaceAmount) * (1 - Math.exp(-delta * 4))
    atmosphere.update(clock.timeOfDay, boatState.dir, camera.position.length(), spaceAmount, weather.levels) // lights, fog, sky and water colours
    sky.update(camera)
    clouds.update(delta, weather.levels.cover, spaceAmount)

    // Lamps (lighthouse, buoys) come on at night and during storms.
    const night = Math.min(1, Math.max(0, (0.1 - atmosphere.state.elevation) / 0.22))
    world.update(elapsed, weather.levels.storm, Math.max(night, 0.6 * weather.levels.storm * weather.levels.cover))
    rain.update(boatState)
    wake.update(sim, boatState)

    // Sounds and messages for things that just happened, and the continuous sounds.
    if (playing) {
      if (input.lights !== previous.lights) {
        audio.lamp(input.lights)
        hud.toast(input.lights ? 'Lamp on' : 'Lamp off')
      }
      if (input.anchored !== previous.anchored) {
        audio.anchor(input.anchored)
        hud.toast(input.anchored ? 'Anchor down' : 'Anchor up')
      }
      if (input.horn !== previous.horn) audio.horn(input.horn)
      audio.update({ speed: boatState.vel.length(), storm: weather.levels.storm, rain: weather.levels.rain, space: spaceAmount })

      const dark = atmosphere.state.elevation < 0.02
      if (dark && !input.lights && !darkHinted) {
        hud.toast('It is getting dark: press L for the lamp', 3.5)
        darkHinted = true
      }
      if (!dark) darkHinted = false
    }
    previous = { lights: input.lights, anchored: input.anchored, horn: input.horn }

    hud.update({
      time: clock.format(),
      day: clock.dayLabel(),
      timeOfDay: clock.timeOfDay,
      heading: compassHeading(boatState),
      anchored: input.anchored,
      lights: input.lights,
      horn: input.horn,
      speed: boatState.vel.length(),
      storm: weather.levels.storm,
      camera: rig.mode,
      muted: audio.muted,
      post: input.post,
    })

    post.enabled = input.post
    post.render() // scene + bloom + vignette (or a plain render while effects are off)

    if (firstFrame) {
      firstFrame = false
      document.querySelector('#loading').classList.add('done')
    }
  })

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(innerWidth, innerHeight)
  })
}

function showError(detail) {
  document.querySelector('#loading')?.classList.add('done')
  document.querySelector('#error').hidden = false
  document.querySelector('#error-detail').textContent = detail
}

main().catch((error) => {
  console.error(error)
  showError(error?.message ?? String(error))
})
