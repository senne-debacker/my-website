// Single source of truth for every number that the GPU (TSL) and the CPU
// (boat physics, later) must agree on. Change a wave parameter here and both
// sides follow.

export const PLANET = {
  radius: 5,
  // IcosahedronGeometry detail: each edge is split into (detail + 1) segments,
  // so the planet has 20 * (detail + 1)^2 triangles.
  detail: 32,
}

export const WAVES = {
  frequency: 2.4, // how many noise cells fit on the unit sphere
  speed: 0.06, // domain drift along z per second (Shadertoy used iTime * 0.025)
  calmAmplitude: 0.14, // world units, at storm = 0
  stormAmplitude: 0.5, // world units, at storm = 1
}

// Fallback colours. Water colours are overridden every frame by the day/night
// keyframes (SKY_KEYS below); the background is only visible before the sky
// dome has drawn.
export const PALETTE = {
  deep: '#10304a',
  shallow: '#3b8fa0',
  foam: '#e8efe9',
  background: '#1b2a3a',
}

// Schools of fish under the water: a boids simulation ported from Shadertoy "[SH17C] Schooling"
// by P_Malin (tsl/boids.js), painted as soft shadows into the water (tsl/fishShadows.js).
export const FISH = {
  
  count: 120,
  schoolSize: 10, // fish are placed in schools at the start: the original relies on a dense crowd
  // The original works in its own units: a 10 x 10 world, speeds per animation frame. These map it
  // onto the planet:
  lengthScale: 0.5, // world units per unit of the original (its neighbour radius 0.75 becomes 0.375)
  frameRate: 12, // frames of the original per second: its top speed (0.1 / frame) becomes 0.1 * 0.5 * 12 = 0.6 units/s
  // Slider values of the original (their defaults were in the part of the code that was cut off,
  // so 1 is assumed for each): the weights are scaled by these.
  cohesion: 1,
  separation: 1,
  alignment: 1,
  // Added: schools swim away from the boat.
  fleeRadius: 1.2, // world units
  fleeWeight: 0.006,
  // Drawing: the fish are soft dark ellipses painted into the water (tsl/fishShadows.js)
  size: 0.14, // length of a shadow, world units (the boat is 0.9)
  shadow: 0.62, // how dark the shadows are (0 = invisible, 1 = as dark as the deep water)
  nearSchools: 3, // this many schools start close to where the game starts, so there are fish to see
}

export const WATER = {
  foamThreshold: 0.3, // noise value above which foam appears (storm = 0)
  stormFoamThreshold: 0.24, // ... and at storm = 1
  // Colour per triangle (true low-poly) instead of a smooth gradient.
  flatColor: true,
}

// Boat conventions: local +Y is up, local -Z is forward (the bow), +X is starboard.
export const BOAT = {
  length: 0.9,
  width: 0.38,
  // Optional own model (public/models/boat.glb): see scene/boat.js loadBoatModel.
  model: { file: 'models/boat.glb', fitLength: true, flat: true },
  // How far the whole model is lifted above the waterline. The hull's dark underwater part is
  // 0.12 deep, so at 0.05 a little of it shows above the water. Measured in a full storm over 4 minutes,
  // water washes over the hull's edge: 7% of the time at 0, 0.6% at 0.05 (up to 5 cm, brief spray),
  // 0.1% at 0.08. Calmer weather stays dry at 0.05. Lower = deeper in the water.
  rideHeight: 0.05,
  // Where the waves are sampled to find the boat's height and tilt. Roughly the
  // hull footprint: front/back along the keel, left/right across the beam.
  sampleHalfLength: 0.38,
  sampleHalfWidth: 0.16,

  // Handling. The boat is a small rigid body on the sea: thrust along the hull, a keel
  // that resists sideways slip, and turning with inertia. (World units: planet radius = 5.)
  maxSpeed: 1.0, // units / second (the HUD shows units x 5 = 5 knots)
  boostSpeed: 1.6, // units / second while Shift is held: 8 knots (the HUD shows units x 5 as knots)
  maxReverseSpeed: 0.35,
  acceleration: 0.65, // 1 / s, how fast speed approaches the throttle target (heavy hull: slow)
  drag: 0.4, // 1 / s, coasting with no throttle
  anchorBrake: 2.5, // 1 / s, speed decay once the anchor is down
  turnRate: 1.3, // rad / s at full steering authority
  yawResponse: 2.6, // 1 / s, how quickly the turn rate follows the helm (turning inertia)
  keelGrip: 5, // 1 / s, how fast sideways slip dies out (lower = more drift in turns)
  anchorGrip: 8,
  anchorSway: 0.06, // rad / s amplitude of the slow yaw swing at anchor
  anchorSwayRate: 0.5, // rad / s frequency of that swing

  // Collisions with islands and rocks.
  shoreMargin: 0.28, // centre of the boat to the waterline of a shore, world units
  restitution: 0.25, // 0 = dead stop, 1 = perfect bounce
  shoreFriction: 0.35, // Coulomb friction while scraping along a shore
  hullInertia: 0.5, // resistance to being spun by an impact
  pushOut: 30, // 1 / s, how quickly an overlap is corrected (soft, so no teleporting)
  maxPushOut: 0.12, // world units per frame

  // Weight: the visible hull follows the waves through springs (see physics/boatDynamics.js),
  // so short ripples are ignored and long swells lift and roll it slowly.
  weight: {
    heaveFreq: 3.0, // rad / s, natural frequency of the up/down motion (period ~2 s)
    heaveDamping: 0.75, // 1 = no overshoot
    tiltFreq: 2.4, // rad / s, natural frequency of roll and pitch (period ~2.6 s)
    tiltDamping: 0.55, // < 1: a little overshoot, so it rocks before settling
    leanFactor: 0.07, // lean outward in turns: speed * turn rate * this
    maxLean: 0.12, // radians
    pitchFromAccel: 0.05, // bow lifts / stern squats when accelerating
    bowTrim: 0.025, // bow rides slightly higher at speed
    maxPitch: 0.07,
  },
}

export const CAMERA = {
  // The planet is small, so the horizon is close: from a low camera it would sit
  // right behind the wheelhouse. A high camera looking down sees the water ahead.
  distance: 3.0, // behind the boat, along the tangent
  height: 3.2, // above the base sphere
  lookAhead: 2.6,
  lookHeight: 0.2,
  follow: 6, // 1 / s, how tightly the rig follows the boat's position
  swing: 3.5, // 1 / s, how quickly it swings behind a turning boat
  minZoom: 0.5,
  maxZoom: 2.5,
  switchSeconds: 1.4, // the glide between the chase view and the planet view
  dragSpeed: 0.006, // radians per pixel when dragging to look round the boat
  lookReturnDelay: 3, // seconds after the last drag before the camera starts to swing back behind the boat
  lookReturnRate: 1.2, // 1 / s, how quickly it returns (slow: about 2 s to get most of the way)
  minPitch: -0.6, // lowest the dragged camera goes, as a fraction of `height` below the normal height
  maxPitch: 0.8, // highest, above it
}

// The title screen: a close-up of the boat from in front and to port (the sun is ahead of the boat at
// the start, so the camera has it over its shoulder and the bow is lit). Pressing "Set sail" swings
// the camera round the port side to the chase view behind the boat.
export const INTRO = {
  azimuth: 58, // degrees round the boat, 0 = straight ahead of the bow, 180 = behind, + = towards port
  radius: 3.1, // horizontal distance from the boat
  height: 1.05, // above the water
  lookAhead: 0,
  lookHeight: 0.4, // where the camera looks, above the water: higher = the boat sits lower, clear of the title
  fov: 38, // narrower than the game's 55: a "long lens" close-up
  swayDegrees: 7, // slow drift of the camera round the boat while the title is up
  swaySpeed: 0.2,
  panSeconds: 2.8,
}

export const BOAT_PALETTE = {
  hullTop: '#7b2d2d', // dark red, like the boat in the Dredge screenshots
  hullBottom: '#431c20',
  deck: '#7a6249',
  cabin: '#e3d6bd', // cream
  roof: '#6a2427',
  window: '#1d2a33',
  crate: '#8a6a4a',
  metal: '#5d6468',
  tire: '#15191c',
  flag: '#3b8fa0',
  horn: '#b08d3c', // brass
}

// Bow lamp: a SpotLight plus a faint light cone. All positions are in the boat's
// local space (+Y up, bow towards -Z).
export const BOAT_LIGHT = {
  color: '#ffe3ae',
  intensity: 20, // candela
  distance: 12, // light cut-off (world units)
  angle: 0.5, // half-angle of the beam, radians
  penumbra: 0.6,
  decay: 2,
  lampPosition: [0, 0.24, -0.4], // [x sideways, y up, z forward = more negative]
  // Where the beam points to. Tilted ~23 degrees down: the planet is small, so the
  // water curves away fast and a level beam would shoot off into space.
  aim: [0, -1.25, -3.9],
  coneLength: 5,
  coneStrength: 0.08, // peak opacity of the additive cone
  windowGlow: '#ffc46e',
  // The straight spotlight cannot reach water beyond the planet's horizon (1.7 units from the lamp,
  // the sea curves away under the beam), so the water shader also draws the lamp's pool of light
  // along the curved surface (tsl/lampPool.js).
  pool: {
    length: 7.5, // how far ahead of the bow the pool reaches, along the water
    halfAngle: 0.38, // radians either side of the bow direction
    strength: 0.12, // brightness of the pool
    start: 0.35, // the pool begins this far ahead of the boat's centre (the lamp is on the bow)
    daylight: 0.12, // fraction of its strength left in full daylight (the lamp barely shows by day)
  },
}

// --- Day / night ------------------------------------------------------------
export const DAY = {
  length: 210, // seconds for a full day
  start: 0.7708, // time of day at start (18:30): 0 = midnight, 0.5 = noon
  // The day's schedule, in hours. Between `dawn` and `day` it is morning twilight, between `dusk`
  // and `night` evening twilight; `day` to `dusk` is full daylight and `night` to `dawn` full night.
  // The same hours colour the dial at the top of the HUD.
  hours: { dawn: 4, day: 6, dusk: 18, night: 20 },
  // How high the sun is (degrees above the horizon, at the boat) when full day begins and when
  // full night begins. They match the "day" and "night" keys of SKY_KEYS below (elevation 0.45 and
  // -0.30, with the 0.99 factor of the noon tilt): the sun is moved so it reaches those heights
  // exactly at the hours above, and is faster in the twilights than at noon.
  sunDayDeg: 27,
  sunNightDeg: -18,
  fastForward: 14, // speed multiplier while T is held
  // The sun travels on the great circle through `east` (where it rises) and
  // `noon` (where it peaks). They are perpendicular. The boat starts near the
  // noon point, heading towards the sunset side.
  east: [-1, 0, 0],
  noon: [0, 0.45, 0.893],
  fogDensity: 0.05, // haze in the chase camera (FogExp2), off in planet view
  moonColor: '#9db4e0',
  moonDiscColor: '#e8eeff',
}

// Everything that changes with the time of day, keyed by the sun's elevation at
// the boat's position (dot(boat up, sun direction): -1 = straight below, 0 = on
// the horizon, 1 = overhead). Values are blended linearly between neighbours.
// Colours were picked from the Dredge screenshots: orange horizon + mauve
// clouds at sunset, deep teal water, near-black blue nights.
export const SKY_KEYS = [
  { // night
    elevation: -0.3,
    zenith: '#060b1a', horizon: '#152848',
    sunColor: '#ff8a50', sunIntensity: 0,
    hemiSky: '#3a5488', hemiGround: '#0e1620', hemiIntensity: 1.6,
    moonIntensity: 2.2, stars: 1,
    deep: '#0b1b2c', shallow: '#1d4a63', foam: '#a9bdd6',
  },
  { // blue hour
    elevation: -0.12,
    zenith: '#0b1730', horizon: '#4a4a6c',
    sunColor: '#ff7a45', sunIntensity: 0,
    hemiSky: '#4a5e8c', hemiGround: '#161e2e', hemiIntensity: 1.5,
    moonIntensity: 1.6, stars: 0.6,
    deep: '#0c1d33', shallow: '#27607a', foam: '#b8c0cc',
  },
  { // sun on the horizon
    elevation: 0,
    zenith: '#2b3a5e', horizon: '#e0855a',
    sunColor: '#ff8a4a', sunIntensity: 1.8,
    hemiSky: '#9a86a8', hemiGround: '#2a2a3a', hemiIntensity: 1.6,
    moonIntensity: 0.6, stars: 0,
    deep: '#142a40', shallow: '#3d7488', foam: '#f0d4bd',
  },
  { // golden hour
    elevation: 0.14,
    zenith: '#3b5f94', horizon: '#e8b080',
    sunColor: '#ffb878', sunIntensity: 2.8,
    hemiSky: '#9db4c8', hemiGround: '#34404c', hemiIntensity: 1.5,
    moonIntensity: 0, stars: 0,
    deep: '#10304a', shallow: '#3b8fa0', foam: '#efe6d6',
  },
  { // day
    elevation: 0.45,
    zenith: '#2f78c4', horizon: '#a8cce0',
    sunColor: '#fff0d8', sunIntensity: 3.2,
    hemiSky: '#9cc4e6', hemiGround: '#3a4a5c', hemiIntensity: 1.5,
    moonIntensity: 0, stars: 0,
    deep: '#10304a', shallow: '#3b8fa0', foam: '#e8efe9',
  },
]

// --- Weather ----------------------------------------------------------------
// Lightning (world/lightning.js): only while it pours and the sea is high.
export const LIGHTNING = {
  minRain: 0.6,
  minStorm: 0.6,
  firstWait: [2, 6], // seconds from the storm starting to the first strike
  interval: [5, 14], // seconds between strikes
  brightness: [0.7, 1],
  rise: 0.02, // seconds a flicker takes to reach full brightness
  fade: 0.1, // seconds for a flicker to fade (time constant)
  thunderDelay: [0.4, 3.2], // seconds from flash to thunder
  color: '#dbe6ff',
  sky: 0.5, // how far the sky and haze go towards the flash colour
  light: 2.2, // extra light from above on the boat and water
}

// Dolphins (scene/dolphin.js): now and then one leaps out of the water near the boat and is gone.
export const DOLPHIN = {
  enabled: false, // switched off for now: nothing is created or loaded, the code stays
  model: 'models/dolphin.glb', // optional, in public/; without it a low-poly dolphin is built in code
  length: 0.8, // nose to tail, world units (the boat is 0.9)
  nose: [0, 0, 1], // which way the nose points in the model file (glTF from Blender: usually +Z)
  interval: [0, 1], // seconds between jumps
  maxStorm: 0.7, // no jumping in a bigger storm than this
  duration: 1.5, // seconds from leaving the water to going back in
  distance: 1.9, // how far it travels over the water
  height: 0.7, // how high above the water it gets
  dip: 0.35, // how far below the surface the leap starts and ends (hidden by the water)
  spawn: { distance: [1.0, 2.5], bearing: [30, 100] }, // from the boat: units, degrees off the bow (either side)
  wag: { amplitude: 0.07, speed: 14, wavelength: 0.2 }, // tail beat: size (x length), rad/s, along the body
  concurrent: 2,
  splash: { size: 3.2, seconds: 0.9 }, // the ring of foam where it enters and leaves the water
}

// Three numbers describe the weather: `storm` (wave height and foam, see
// uniforms.storm), `cover` (cloud cover / overcast sky) and `rain`.
export const WEATHER = {
  // Manual presets (keys 1 / 2 / 3).
  presets: {
    calm: { storm: 0, cover: 0.1, rain: 0 },
    breezy: { storm: 0.5, cover: 0.55, rain: 0 },
    storm: { storm: 1, cover: 1, rain: 1 },
  },
  // Automatic cycle (key 4). Each state lasts a random time between min and max seconds.
  cycle: [
    { name: 'clear', storm: 0, cover: 0.12, rain: 0, min: 50, max: 80 },
    { name: 'overcast', storm: 0.4, cover: 0.8, rain: 0.25, min: 30, max: 45 },
    { name: 'storm', storm: 1, cover: 1, rain: 1, min: 40, max: 60 },
    { name: 'clearing', storm: 0.35, cover: 0.5, rain: 0.1, min: 20, max: 30 },
  ],
  easeRate: 0.3, // 1 / s: how quickly the weather levels move towards the target
}

export const CLOUDS = {
  count: 30,
  minAltitude: 6, // above the base sphere (the default camera is ~3.2 up)
  maxAltitude: 8.5,
  windSpeed: 0.012, // rad / s around the wind axis
  windAxis: [0.2, 1, 0.1],
  fairColor: '#f4f2ee',
  stormColor: '#202632',
}

// Ripples where raindrops hit the sea (tsl/raindrops.js, ported from Shadertoy ldjyWw).
export const DROPS = {
  scale: 0.1, // the original's vorRainScale: size of one cell in world units (bigger = bigger ripples)
  timeScale: 0.8, // the original's vorRainSpeed
  chance: 0.1, // fraction of the cells that have a drop going at full rain (added; the original always rains)
  height: 0.5, // strength of the ripples' slope (1 = as in the original, scaled to the cell size)
  shine: 1, // how much the ripples lighten the water colour
  fade: [0.04, 0.4], // rain level where the ripples are gone, and where they are at full strength: they fade out smoothly between these as the rain stops, in step with the rain streaks
  visible: [3, 9], // distance from the camera (units) where they are fully visible and where they are gone
}

export const RAIN = {
  count: 2600,
  area: 11, // width of the rain patch around the boat
  height: 9, // how far above the water the streaks start
  speed: 11, // fall speed, units / s
  length: 0.38,
  thickness: 0.008,
  color: '#b4c4d8', // the colour in full daylight; dimmed by the light level (tsl/rainMaterial.js)
  opacity: 0.22,
  nightLight: 0.55, // fraction of the colour and opacity left on a dark night (0 = invisible)
}

// --- Boat wake ----------------------------------------------------------------
// The last `points` stern positions (one every `interval` seconds) are passed to
// the water shader: the waves emitted from each of them add up to the V-shaped wake
// (tsl/wakeWaves.js), and a strip of foam follows them (tsl/wake.js).
export const WAKE = {
  points: 64,
  interval: 0.1,
  sternOffset: 0.3, // emit from behind the middle of the boat
  // Propeller wash: churned water right behind the stern, a continuous strip of foam.
  washWidth: 0.16,
  washGrowth: 0.03,
  washDecay: 0.4,
  washStrength: 0.16,
  // Bow splash: a patch of foam where the bow pushes the water aside.
  bowOffset: 0.42, // ahead of the middle of the boat
  bowRadius: 0.2,
  bowStrength: 0.55,
  // Look: the smooth wake value (0..1) is broken up with noise at pixel resolution, then cut off
  // sharply, which gives lacy edges that stand out from the wave foam.
  breakup: 0.3, // noise amplitude
  breakupScale: 3.4, // noise frequency, in cells per world unit
  edge: [0.26, 0.4], // wake value where the foam starts and where it is fully white
  halo: 0.55, // how much the water around the wake is lightened (wet, aerated look)
  // Wake waves (tsl/wakeWaves.js, the Shadertoy wake shader): the sum of the waves the boat
  // emitted along its past path, shown as a bump on the water and a light/dark shading.
  waves: {
    substeps: 1, // samples per stored interval (more = smoother, slower; 1 is enough off the path)
    gravity: 12, // g in game units / s^2: sets how quickly waves of each length run
    peak: 0.65, // l0: the boat emits most strongly waves with half-wavelength about this (units)
    width: 0.2, // W: how wide that peak is (units)
    pathFade: [0.12, 0.4], // the waves fade out this close to the boat's path (units); see wakeWaves.js
    minLength: 0.12, // closest distance used (1/l would blow up on the path)
    fadeAge: [4.5, 6.2], // the oldest entries fade out between these ages (s)
    gain: 0.05, // overall size of the height
    scale: 20, // height -> -1 .. 1 for the colouring (1 / the tallest crest)
    shade: 0.5, // how much crests lighten and troughs darken the colour
    foam: [0.55, 0.85], // crest level where white lace starts and where it is full
    foamStrength: 0.8,
    visible: [5, 10], // fades out with distance from the camera (units)
  },
}

// --- World ----------------------------------------------------------------------
export const WORLD = {
  seed: 20261008,
  // Where the boat starts (the same frame is used to place landmarks).
  start: { dir: [0, 0.3, 0.954], heading: [1, 0, 0] },
  startClear: 2.4, // no scattered island this close to the start (world units)
  // Hand-placed islands near the start. bearing: degrees from the initial heading
  // (+90 = starboard); distance: radians of arc from the start (1 rad = 5 units);
  // radius: shoreline radius in world units; height: peak above sea level.
  landmarks: [
    { name: 'lighthouse', bearing: 14, distance: 0.75, radius: 0.95, height: 1.1, trees: 5, treeKind: 'pine', ground: 'rock', lighthouse: true },
    { name: 'pines', bearing: -66, distance: 0.95, radius: 1.3, height: 0.8, trees: 34, treeKind: 'pine', ground: 'grass' },
    { name: 'autumn', bearing: 112, distance: 0.8, radius: 0.7, height: 0.6, trees: 10, treeKind: 'autumn', ground: 'autumn' },
  ],
  // The big ocean: one circle of open water with no islands, rocks or buoys. Everything else is
  // generated exactly as before and only what touches the circle is left out. `fraction` is the
  // share of the planet's surface it covers (0.22 -> a circle 56 degrees across, 4.9 units radius);
  // `bearing` / `distance` place its centre like the landmarks (degrees from the start heading,
  // radians of arc from the start): 180 = straight behind the start.
  ocean: { fraction: 0.22, bearing: 180, distance: 2.2 },
  scattered: { islands: 7, minRadius: 0.6, maxRadius: 1.9, gap: 0.7, seaRocks: 14 },
  // Buoys marking a route from the start towards the lighthouse, plus a few in open water.
  buoyRoute: [
    { bearing: 3, distance: 0.18 },
    { bearing: -8, distance: 0.3 },
    { bearing: 2, distance: 0.4 },
  ],
  scatteredBuoys: 6,
  maxBodies: 32, // islands + rocks the water shader draws shore foam for
}

export const WORLD_PALETTE = {
  sand: '#8f8470',
  cliff: '#6b6670',
  cliffDark: '#57545d',
  grass: '#4f6140',
  autumnGround: '#7a5c38',
  rockTop: '#706b6a',
  pine: '#25402f',
  pineLight: '#33573d',
  autumnLeaves: ['#b4622c', '#a24a22', '#c47a34'],
  trunk: '#4a3526',
  rock: '#6a6a72',
  lighthouseRed: '#a8322d',
  lighthouseWhite: '#e8e2d4',
  gallery: '#2b2e33',
  lighthouseRoof: '#7a2a28',
  lanternGlow: '#ffd78a',
  buoyRed: '#b3312c',
  buoyWhite: '#e6e0d0',
  buoyLamp: '#ffcf70',
}

export const LIGHTHOUSE = {
  beamSpeed: 0.9, // rad / s
  beamLength: 9,
  beamAngle: 0.2,
  intensity: 260, // candela of the rotating SpotLight at full darkness
  color: '#ffe3a8',
}

// --- Fishing ---------------------------------------------------------------------
// The hold-and-release fight (fishing/fishingMinigame.js). Progress and tension both run 0..1:
// holding the reel fills progress slowly and tension quickly, letting go drains tension.
export const FISHING = {
  fight: {
    progressRate: 0.17, // progress per second while the reel is held (6 s of holding in all)
    progressSlip: 0.03, // progress lost per second while it is not: the fish swims off with the line
    tensionRise: 0.5, // tension per second while held (the line snaps after 2 s of holding) ...
    tensionFall: 0.7, // ... and lost per second when released (1.4 s from snapping to slack)
    // The fish pulls now and then: `pull` extra tension per second for `duration` s, announced
    // `warn` s before it starts; `every` = [min, max] seconds between pulls. null = no pulls.
    thrash: { every: [2.5, 5.5], duration: 0.6, pull: 0.55, warn: 0.5 },
    danger: 0.8, // tension above this is drawn as danger (the interface only)
  },

  // Fishing spots: patches of bubbling water. Dropping the anchor within `triggerRadius` of one
  // starts the fight. Placed by world/layout.js (after everything else, with its own random numbers,
  // so the rest of the world is exactly what it was without them).
  spots: {
    seed: 20261014,
    count: 6, // in all
    oceanCount: 2, // this many of them in the big empty ocean (WORLD.ocean)
    nearStart: { bearing: 38, distance: 0.3 }, // one close to the start, placed like a landmark (degrees from the heading, radians of arc)
    clearance: 0.9, // from the edge of any island, rock or buoy (world units): room to anchor beside it
    gap: 1.8, // between two spots
    startClear: 0.9, // none closer than this to where the boat starts (except the near-start one)
    triggerRadius: 0.45, // anchor within this distance (over the sea, world units) = the fish bite
    hintRadius: 2.2, // within this the game says that fish are biting
    // (a spot that gave up a fish stays empty until the clock passes midnight, see main.js)
    // The patch of foam the water shader paints at each spot (tsl/spotFoam.js): a disc with rings
    // lapping outwards. It is what you see from far away and from space.
    patch: 0.3, // radius, world units
    patchFoam: 0.7, // how white it is (1 = as foam on a crest)
    // The bubbles (tsl/fishingBubbles.js): all of them are drawn from one instanced mesh
    bubbles: 20, // per spot
    radius: 0.225, // the patch of water they rise in
    rise: 0.38, // how far above the water they get before they pop
    size: 0.038, // a bubble's radius at its biggest
    speed: 0.45, // rises per second (the cycle time of a bubble is about 1 / speed)
    opacity: 0.45,
    color: '#a9cfdc',
  },
}

// --- Post-processing ---------------------------------------------------------------
export const POST = {
  bloomStrength: 0.3,
  bloomRadius: 0.55,
  bloomThreshold: 1.0, // HDR luminance above which pixels glow
  vignetteStart: 0.35, // distance from the screen centre where darkening starts ...
  vignetteEnd: 0.85, // ... and where it is strongest
  vignetteStrength: 0.4,
}
