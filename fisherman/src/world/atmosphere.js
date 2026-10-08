import { Color, Vector3, FogExp2 } from 'three/webgpu'
import { CLOUDS, DAY, PLANET, SKY_KEYS } from '../config.js'
import { uniforms } from '../uniforms.js'

const COLOR_PROPS = ['zenith', 'horizon', 'sunColor', 'hemiSky', 'hemiGround', 'deep', 'shallow', 'foam']
const NUMBER_PROPS = ['sunIntensity', 'hemiIntensity', 'moonIntensity', 'stars']

// Keyframes with real Color objects (hex strings are converted to linear colour
// space once, here).
const keys = SKY_KEYS.map((key) => {
  const parsed = { elevation: key.elevation }
  for (const prop of COLOR_PROPS) parsed[prop] = new Color(key[prop])
  for (const prop of NUMBER_PROPS) parsed[prop] = key[prop]
  return parsed
})

const dayKey = keys[keys.length - 1] // the palette used when looking at the planet from space
const east = new Vector3(...DAY.east)
const noon = new Vector3(...DAY.noon)
const moonLightColor = new Color(DAY.moonColor)
const fairCloud = new Color(CLOUDS.fairColor)
const stormCloud = new Color(CLOUDS.stormColor)

// Overcast: pull a colour towards a blue-grey of the same brightness and darken it.
const grey = new Color()
function overcast(color, amount, dim = 1) {
  const luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
  grey.setRGB(luma * 0.95, luma, luma * 1.1)
  color.lerp(grey, amount).multiplyScalar(dim)
}

// Unit vector from the planet centre towards the sun.
export function sunDirection(timeOfDay, target) {
  const angle = (timeOfDay - 0.25) * Math.PI * 2 // 0 = sunrise, pi/2 = noon, pi = sunset
  return target.copy(east).multiplyScalar(Math.cos(angle)).addScaledVector(noon, Math.sin(angle))
}

const smooth = (t) => t * t * (3 - 2 * t)

// Blend the two keyframes around `elevation` into `out`.
function blend(elevation, out) {
  let i = 0
  while (i < keys.length - 2 && elevation > keys[i + 1].elevation) i++
  const [a, b] = [keys[i], keys[i + 1]]
  const t = smooth(Math.min(1, Math.max(0, (elevation - a.elevation) / (b.elevation - a.elevation))))
  for (const prop of COLOR_PROPS) out[prop].lerpColors(a[prop], b[prop], t)
  for (const prop of NUMBER_PROPS) out[prop] = a[prop] + (b[prop] - a[prop]) * t
}

// Turns the time of day into lighting, fog, sky and water colours.
//
// The sun and moon are global (one DirectionalLight each, so the planet has a
// real day side and night side), but the *mood* (sky colour, sun tint, haze,
// water palette) is chosen from the sun's elevation at the boat. Sail round the
// planet and your local time of day changes.
export function createAtmosphere({ scene, sun, moon, fill }) {
  scene.fog = new FogExp2(0x000000, 0)

  const sunDir = new Vector3()
  const moonDir = new Vector3()
  const state = { elevation: 1 }
  for (const prop of COLOR_PROPS) state[prop] = new Color()
  for (const prop of NUMBER_PROPS) state[prop] = 0

  return {
    state,

    // `localUp`: unit vector at the boat. `cameraHeight`: distance of the camera
    // from the planet centre. `spaceAmount`: 0 in the chase camera, 1 in planet
    // view (the sky becomes a star field and the haze is removed). `weather`: the
    // levels from world/weather.js ({ storm, cover, rain }).
    update(timeOfDay, localUp, cameraHeight, spaceAmount, weather) {
      sunDirection(timeOfDay, sunDir)
      moonDir.copy(sunDir).negate()
      state.elevation = sunDir.dot(localUp)
      blend(state.elevation, state)

      // Weather on top of the time of day: cloud cover greys the sky, dims the sun
      // and hides the stars; storms darken everything and add haze.
      const { cover, storm } = weather
      const gloom = storm * cover
      overcast(state.zenith, cover * 0.85, 1 - 0.45 * gloom)
      overcast(state.horizon, cover * 0.85, 1 - 0.4 * gloom)
      overcast(state.hemiSky, cover * 0.7)
      overcast(state.sunColor, cover * 0.6)
      overcast(state.deep, cover * 0.35, 1 - 0.25 * gloom)
      overcast(state.shallow, cover * 0.35, 1 - 0.25 * gloom)
      overcast(state.foam, cover * 0.3, 1 - 0.15 * gloom)
      state.sunIntensity *= 1 - 0.65 * cover // keep some sun so facets still show shape
      state.moonIntensity *= 1 - 0.6 * cover
      state.hemiIntensity *= 1 + 0.1 * cover
      state.stars *= 1 - cover
      uniforms.cloudColor.value.lerpColors(fairCloud, stormCloud, gloom)

      // In planet view the local mood no longer applies: the planet is lit by the
      // real sun (day side, night side and a terminator) and uses the day palette.
      const sunUp = state.sunIntensity + (dayKey.sunIntensity - state.sunIntensity) * spaceAmount
      sun.position.copy(sunDir).multiplyScalar(50)
      sun.color.lerpColors(state.sunColor, dayKey.sunColor, spaceAmount)
      sun.intensity = sunUp

      moon.position.copy(moonDir).multiplyScalar(50)
      moon.color.copy(moonLightColor)
      moon.intensity = state.moonIntensity * (1 - 0.8 * spaceAmount)

      // The hemisphere light's "up" is its position: aim it away from the planet
      // centre at the boat, so water and boat get sky light from the right side.
      fill.position.copy(localUp)
      fill.color.copy(state.hemiSky)
      fill.groundColor.copy(state.hemiGround)
      fill.intensity = state.hemiIntensity + (0.4 - state.hemiIntensity) * spaceAmount

      scene.fog.color.copy(state.horizon) // far water fades into the horizon colour
      scene.fog.density = DAY.fogDensity * (1 + 1.2 * cover) * (1 - spaceAmount)

      uniforms.sunDir.value.copy(sunDir)
      uniforms.localUp.value.copy(localUp)
      uniforms.sunElevation.value = state.elevation
      // The planet is small, so its edge is far below the horizontal (about 50 degrees
      // from a camera 3 units up). Start the sky gradient at that edge, not at the
      // flat horizon, or the whole visible sky would be one flat horizon colour.
      uniforms.horizonDip.value = Math.sqrt(Math.max(0, 1 - (PLANET.radius / cameraHeight) ** 2))
      uniforms.skyZenith.value.copy(state.zenith)
      uniforms.skyHorizon.value.copy(state.horizon)
      uniforms.sunColor.value.copy(state.sunColor)
      uniforms.stars.value = Math.max(state.stars, spaceAmount)
      uniforms.skyAmount.value = 1 - spaceAmount

      uniforms.deepColor.value.lerpColors(state.deep, dayKey.deep, spaceAmount)
      uniforms.shallowColor.value.lerpColors(state.shallow, dayKey.shallow, spaceAmount)
      uniforms.foamColor.value.lerpColors(state.foam, dayKey.foam, spaceAmount)
    },
  }
}
