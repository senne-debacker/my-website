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
  // Where the waves are sampled to find the boat's height and tilt. Roughly the
  // hull footprint: front/back along the keel, left/right across the beam.
  sampleHalfLength: 0.38,
  sampleHalfWidth: 0.16,

  // Handling. The boat is a small rigid body on the sea: thrust along the hull, a keel
  // that resists sideways slip, and turning with inertia. (World units: planet radius = 5.)
  maxSpeed: 1.8, // units / second
  maxReverseSpeed: 0.6,
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
  intensity: 70, // candela
  distance: 12, // light cut-off (world units)
  angle: 0.5, // half-angle of the beam, radians
  penumbra: 0.6,
  decay: 2,
  lampPosition: [0, 0.27, -0.33],
  // Where the beam points to. Tilted ~23 degrees down: the planet is small, so the
  // water curves away fast and a level beam would shoot off into space.
  aim: [0, -1.25, -3.9],
  coneLength: 5,
  coneStrength: 0.3, // peak opacity of the additive cone
  windowGlow: '#ffc46e',
}

// --- Day / night ------------------------------------------------------------
export const DAY = {
  length: 210, // seconds for a full day
  start: 0.71, // time of day at start: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
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

export const RAIN = {
  count: 2600,
  area: 11, // width of the rain patch around the boat
  height: 9, // how far above the water the streaks start
  speed: 11, // fall speed, units / s
  length: 0.38,
  thickness: 0.008,
  color: '#d6e4f5',
  opacity: 0.3,
}

// --- Boat wake ----------------------------------------------------------------
// The last `points` stern positions (one every `interval` seconds) are passed to
// the water shader, which draws an expanding foam ring around each of them.
// The envelope of all those rings is the V-shaped wake.
export const WAKE = {
  points: 64,
  interval: 0.1,
  sternOffset: 0.3, // emit from behind the middle of the boat
  // V-shaped arms: an expanding ring per remembered point.
  spread: 0.6, // ring growth, units / s (about the 19 degree Kelvin angle at top speed)
  width: 0.17, // ring thickness when born ...
  widthGrowth: 0.04, // ... and how much thicker it gets per second
  decay: 0.9, // 1 / s, the arms fade with age
  strength: 0.2, // overall foam amount (the rings of neighbouring points add up)
  // Propeller wash: churned water right behind the stern, lasts longer than the arms.
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

// --- Post-processing ---------------------------------------------------------------
export const POST = {
  bloomStrength: 0.3,
  bloomRadius: 0.55,
  bloomThreshold: 1.0, // HDR luminance above which pixels glow
  vignetteStart: 0.35, // distance from the screen centre where darkening starts ...
  vignetteEnd: 0.85, // ... and where it is strongest
  vignetteStrength: 0.4,
}
