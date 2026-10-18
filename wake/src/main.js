import {
  WebGPURenderer, Scene, PerspectiveCamera, Color, Vector3, ACESFilmicToneMapping,
} from 'three/webgpu'

import { PALETTE, INTRO, BOAT, FISHING, CAMERA } from './config.js'
import { uniforms } from './uniforms.js'
import { createPlanet } from './scene/planet.js'
import { createFish } from './scene/fish.js'
import { createLighting } from './scene/lighting.js'
import { createBoat } from './scene/boat.js'
import { createSky } from './scene/sky.js'
import { createClouds } from './scene/clouds.js'
import { createRain } from './scene/rain.js'
import { createClock } from './world/clock.js'
import { createAtmosphere } from './world/atmosphere.js'
import { createWeather } from './world/weather.js'
import { createWind } from './world/wind.js'
import { QUALITY } from './quality.js'
import { setupTouchMode, setupStick, isTouch } from './touch.js'
import { setupTilt } from './tilt.js'
import { createDolphins } from './scene/dolphin.js'
import { createLightning } from './world/lightning.js'
import { createWake } from './world/wake.js'
import { createLayout } from './world/layout.js'
import { createWorld } from './scene/world.js'
import { createFishingSpots } from './scene/fishingSpots.js'
import { createFishingMinigame } from './fishing/fishingMinigame.js'
import { createLogbook } from './fishing/logbook.js'
import { rollFish } from './fishing/fishDatabase.js'
import { createBoatState, createBoatPose, computeBoatPose } from './physics/boat.js'
import { createBoatDynamics, applyBoatWeight } from './physics/boatDynamics.js'
import { stepBoat } from './physics/boatMotion.js'
import { resolveCollisions } from './physics/collision.js'
import { createCameraRig } from './camera/cameraRig.js'
import { createHud, compassHeading } from './hud.js'
import { createMenu } from './menu.js'
import { createDevMode } from './devMode.js'
import { createCursorHider } from './cursor.js'
import { createLoader } from './loader.js'
import { createAudio } from './audio/audio.js'
import { createPostProcessing } from './post.js'
import { setupInteraction } from './interaction.js'

const FOG_ZOOM = 0.5 // how much the haze thins out when zooming out: 1 = in proportion to the distance (clear), 0 = not at all
const CHASE_DISTANCE = Math.hypot(CAMERA.distance, CAMERA.height) // about how far the camera is from the boat at the normal zoom

async function main() {
  // The assignment requires WebGPU. WebGPURenderer would silently fall back to
  // a WebGL2 backend, so refuse to start instead of hiding that.
  if (!navigator.gpu) {
    showError('navigator.gpu is undefined.')
    return
  }

  setupTouchMode() // on-screen buttons on phones and tablets (see touch.js)
  const loader = createLoader()
  await loader.stage(0.08, 'Starting the engine')

  // --- Renderer ---------------------------------------------------------------
  const renderer = new WebGPURenderer({ antialias: true })
  renderer.setPixelRatio(QUALITY.pixelRatio)
  renderer.setSize(innerWidth, innerHeight)
  renderer.toneMapping = ACESFilmicToneMapping
  document.querySelector('#app').appendChild(renderer.domElement)
  await renderer.init() // WebGPU adapter/device are requested asynchronously

  await loader.stage(0.25, 'Building the world')

  // --- Scene + camera ---------------------------------------------------------
  const scene = new Scene()
  scene.background = new Color(PALETTE.background)

  const camera = new PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200)

  const { sun, moon, fill } = createLighting()
  const boat = createBoat()
  await boat.ready // your own boat model (public/models/boat.glb), if there is one, replaces the built-in boat
  const layout = createLayout() // where islands, rocks and buoys are (also used for collisions)
  const world = createWorld(layout)
  const spots = createFishingSpots(layout.fishingSpots) // patches of bubbling water: drop the anchor on one to fish
  const sky = createSky()
  const clouds = createClouds()
  const rain = createRain()
  const fish = createFish(renderer, layout)
  const planet = createPlanet(fish) // the water paints the fish's shadows
  scene.add(sky.mesh, planet, world.group, spots.mesh, clouds.group, rain.mesh, sun, moon, fill, boat.root)

  const clock = createClock()
  const weather = createWeather()
  const wind = createWind()
  const wake = createWake()
  const atmosphere = createAtmosphere({ scene, sun, moon, fill })
  const lightning = createLightning({ onStrike: (delay, brightness) => audio.thunder(delay, brightness) })
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
  const dolphins = createDolphins({ scene, layout, audio })

  // --- Fishing: the anchor goes down over a bubbling spot -> the minigame (src/fishing/) ------------------
  // The fish is rolled when the fight starts but stays hidden until it is landed, so that a rarer
  // fish can pull harder. The world keeps running during the fight (state 'fishing'); only the
  // controls are locked, and the anchor stays down afterwards.
  let fishingSpot = null // the spot being fished
  const logbook = createLogbook({ onClose: () => state === 'logbook' && setState('playing') })
  const fishing = createFishingMinigame({
    logbook,
    onFrame: (fight) => audio.reel(fight),
    onResult: (result) => {
      audio.reelStop()
      if (result.outcome === 'caught') {
        audio.fishCaught(result.fish.rarity)
        if (fishingSpot) spots.deplete(fishingSpot) // the school scatters: the spot is empty until midnight
      } else if (result.outcome === 'snapped') {
        audio.lineSnap()
      }
    },
    onClose: () => {
      fishingSpot = null
      if (state === 'fishing') setState('playing')
    },
  })
  function startFishing(spot) {
    fishingSpot = spot
    audio.fishBite()
    setState('fishing')
    fishing.open({ fish: rollFish() })
  }
  atmosphere.update(clock.timeOfDay, boatState.dir, camera.position.length(), spaceAmount, weather.levels) // correct lighting from the first frame

  // --- Game state: start screen -> starting -> playing <-> paused -----------------------------------
  //   menu      the start screen: a close-up of the boat with the title over it
  //   starting  "Set sail" was pressed: the camera swings round to behind the boat
  //   playing   the game
  //   paused    the pause screen
  //   fishing   the minigame is up: the world runs, the controls are locked
  //   logbook   the fish logbook is open: like paused, without the pause screen
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
    onLogbook: () => {
      if (state !== 'playing') return
      setState('logbook')
      logbook.open()
    },
    onBlur: () => state === 'playing' && setState('paused'),
  })
  const menu = createMenu({
    audio,
    onMute: toggleSound,
    onStart: () => {
      if (state !== 'menu') return
      tilt.begin() // (a tap: iOS asks for the motion sensor here)
      audio.start() // browsers only allow sound after a click, so the audio engine is created here
      setState('starting')
      rig.pan(INTRO.panSeconds, () => setState('playing')) // swing round behind the boat, then sail
    },
    onResume: () => {
      tilt.begin()
      setState('playing')
    },
  })
  setupStick(interaction) // the touch joystick
  const tilt = setupTilt(interaction, { notify: (text) => hud.toast(text, 3.5) }) // steering by tilting the phone, an alternative to the stick's left / right
  const dev = createDevMode({ interaction, clock, spots, logbook, startFishing, getState: () => state }) // ?dev + code: weather, time and fishing tools
  const cursor = createCursorHider()
  // The clickable HUD: every button triggers the same action as its key; buttons marked data-hold
  // (horn, hold-for-time) act while the mouse button is down.
  for (const element of document.querySelectorAll('#hud [data-key]')) {
    const key = element.dataset.key
    const held = 'hold' in element.dataset
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      interaction.press(key)
      if (held) element.setPointerCapture(event.pointerId)
    })
    if (held) {
      for (const type of ['pointerup', 'pointercancel']) element.addEventListener(type, () => interaction.release(key))
    }
  }
  function setState(next) {
    if (next === 'playing' && (state === 'starting' || state === 'paused')) tilt.calibrate() // the way the phone is held now is "straight ahead"
    state = next
    cursor.setEnabled(next === 'playing')
    interaction.enabled = next === 'playing'
    hud.show(next === 'playing' || next === 'paused' || next === 'fishing' || next === 'logbook')
    menu.showSound(next === 'menu' || next === 'paused')
    if (next === 'menu') menu.showStart()
    if (next === 'starting') menu.hideStart()
    if (next === 'playing') menu.closePause()
    if (next === 'paused') menu.openPause()
    audio.setPaused(next === 'paused' || next === 'logbook')
  }
  setState('menu')

  if (import.meta.env.DEV) window.__game = { boatState, boatPose, input: interaction.input, uniforms, lights: { sun, moon, fill }, clock, atmosphere, weather, lightning, dolphins, boat, layout, world, spots, fishing, logbook, startFishing, scene, camera, audio, fish, getState: () => state } // for debugging in the console

  // `?fish` checks the fish simulation on the GPU (see src/debug/fishTest.js).
  if (new URLSearchParams(location.search).has('fish')) {
    // (a few seconds in: the GPU buffers only exist once the first frames have run)
    setTimeout(() => import('./debug/fishTest.js').then(({ runFishTest }) => runFishTest(fish, layout)), 4000)
  }

  // `?parity` runs the GPU-vs-CPU wave comparison (see src/debug/parityTest.js).
  if (new URLSearchParams(location.search).has('parity')) {
    const { runParityTest } = await import('./debug/parityTest.js')
    await runParityTest(renderer)
  }

  // Compile every shader now, behind the loading screen (otherwise the GPU compiles them lazily
  // during the first frames, which shows up as half-drawn, flickering frames).
  await loader.stage(0.55, 'Compiling the shaders')
  await renderer.compileAsync(scene, camera)
  await loader.stage(0.85, 'Warming up')

  // --- Loop -------------------------------------------------------------------
  let last = performance.now()
  let elapsed = 0
  let warmupFrames = 0 // frames drawn under the loading screen before it fades out
  let previous = { lights: false, anchored: false, horn: false }
  let bumpCooldown = 0
  let darkHinted = false
  let lastDay = clock.days // the spots refill when the day changes (midnight)
  let hintedSpot = null // the fishing spot the player was last told about

  renderer.setAnimationLoop((now) => {
    const delta = Math.min((now - last) / 1000, 0.1) // clamp after tab switches
    last = now
    elapsed += delta

    const { input } = interaction
    const playing = state === 'playing'
    const running = playing || state === 'fishing' // the world carries on while you fish: only the controls are locked
    const sim = running ? delta : 0 // game time

    uniforms.time.value = elapsed // single clock shared with the water shader
    tilt.update(delta)
    interaction.update(delta)
    weather.update(sim, input.weather) // storm / cover / rain levels; `storm` also drives the waves

    if (running) {
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
    fish.update(delta, Math.min(1.6, boatState.vel.length() / BOAT.maxSpeed), input.anchored) // the schools of fish swim on the GPU
    wind.update(elapsed, weather.levels.storm)
    boat.update(delta, input.lights, input.horn, elapsed, { angle: wind.bearing - (compassHeading(boatState) * Math.PI) / 180, strength: wind.strength }) // the flag streams downwind
    // The lamp's pool of light on the water (tsl/lampPool.js) follows the boat over the curved surface.
    uniforms.lampDir.value.copy(boatState.dir)
    uniforms.lampForward.value.copy(boatState.heading).addScaledVector(boatState.dir, -boatState.heading.dot(boatState.dir)).normalize()
    uniforms.lampLevel.value = boat.lampLevel
    rig.update(delta, input.planetView, elapsed, input.throttle > 0)

    clock.update(sim, input.fastForward)
    spaceAmount += ((input.planetView ? 1 : 0) - spaceAmount) * (1 - Math.exp(-delta * 4))
    dolphins.update(delta, elapsed, boatState, weather.levels.storm, running, spaceAmount)
    lightning.update(delta, weather.levels, running)
    atmosphere.update(clock.timeOfDay, boatState.dir, camera.position.length(), spaceAmount, weather.levels, lightning.flash, Math.min(1, CHASE_DISTANCE / camera.position.distanceTo(boat.root.position)) ** FOG_ZOOM) // lights, fog (a bit thinner when zoomed out), sky and water colours
    sky.update(camera)
    clouds.update(delta, weather.levels.cover, spaceAmount)

    // Lamps (lighthouse, buoys) come on at night and during storms.
    const night = Math.min(1, Math.max(0, (0.1 - atmosphere.state.elevation) / 0.22))
    const buoyHit = world.update(elapsed, weather.levels.storm, Math.max(night, 0.6 * weather.levels.storm * weather.levels.cover), boatState, delta)
    if (playing && buoyHit > 0) audio.buoyHit(buoyHit) // the boat sails through it and tips it over
    rain.update(boatState)
    wake.update(sim, boatState)
    if (clock.days !== lastDay) {
      lastDay = clock.days
      spots.refill()
    }
    dev.update()
    spots.update({ delta, time: elapsed, storm: uniforms.storm.value, space: spaceAmount })

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

      // Fishing: say so when a spot with fish comes within reach, and start the fight when the anchor
      // goes down on one.
      const biting = input.anchored ? null : spots.nearest(boatState.dir, FISHING.spots.triggerRadius)?.spot ?? null
      if (biting && biting !== hintedSpot) hud.toast(isTouch() ? 'Fish are biting here: tap the anchor' : 'Fish are biting here: drop the anchor (Space)', 3.5)
      hintedSpot = biting
      if (input.anchored && !previous.anchored) {
        const here = spots.nearest(boatState.dir, FISHING.spots.triggerRadius)
        if (here) startFishing(here.spot)
      }

      const dark = atmosphere.state.elevation < 0.02
      if (dark && !input.lights && !darkHinted) {
        hud.toast(isTouch() ? 'It is getting dark: tap the lamp' : 'It is getting dark: press L for the lamp', 3.5)
        darkHinted = true
      }
      if (!dark) darkHinted = false
    }
    if (running) audio.update({ speed: boatState.vel.length(), storm: weather.levels.storm, rain: weather.levels.rain, space: spaceAmount }) // also while fishing
    previous = { lights: input.lights, anchored: input.anchored, horn: input.horn }

    hud.update({
      time: clock.format(),
      day: clock.dayLabel(),
      timeOfDay: clock.timeOfDay,
      heading: compassHeading(boatState),
      anchored: input.anchored,
      lights: input.lights,
      horn: input.horn,
      boost: input.boost,
      speed: boatState.vel.length(),
      storm: weather.levels.storm,
      camera: rig.mode,
      muted: audio.muted,
    })

    post.render() // scene + bloom + vignette

    if (warmupFrames >= 0 && ++warmupFrames === 30) {
      warmupFrames = -1
      loader.finish()
      dev.begin() // with ?dev in the address: asks for the code
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
