import { DirectionalLight, HemisphereLight } from 'three/webgpu'

// Creates the lights; world/atmosphere.js sets their position, colour and
// intensity every frame from the time of day.
export function createLighting() {
  const sun = new DirectionalLight('#ffffff', 0)
  const moon = new DirectionalLight('#ffffff', 0)
  const fill = new HemisphereLight('#ffffff', '#000000', 0)
  return { sun, moon, fill }
}
