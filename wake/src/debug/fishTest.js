// Dev-only: open the app with `?fish` to check the fish simulation on the GPU. It reads the fish
// back and prints, in the console and in a panel, how they are doing: no bad numbers, still on
// the sphere, speeds within the original's limits, none inside an island or rock, and whether the
// schools hold together (neighbours within the original's neighbour radius, scaled: 0.75 * FISH.lengthScale).
// It samples a few times, 15 seconds apart, so you can see the schools persist.
import { PLANET, FISH } from '../config.js'

const R = PLANET.radius
const NEIGHBOUR = 0.75 * FISH.lengthScale

export async function runFishTest(fish, layout) {
  const lines = ['Fish simulation (GPU readback)']
  const panel = document.createElement('pre')
  panel.style.cssText = 'position:fixed;top:12px;left:12px;margin:0;padding:10px;border-radius:4px;background:rgba(10,16,24,.85);color:#e8efe9;font:12px/1.4 ui-monospace,monospace;pointer-events:none;z-index:50'
  document.body.appendChild(panel)

  const sample = async (label) => {
    const { dir, vel } = await fish.snapshot()
    const n = dir.length / 4
    let bad = 0, lengthError = 0, insideLand = 0, speedMin = 1e9, speedMax = 0, neighbours = 0
    for (let i = 0; i < n; i++) {
      const d = [dir[i * 4], dir[i * 4 + 1], dir[i * 4 + 2]]
      const v = [vel[i * 4], vel[i * 4 + 1], vel[i * 4 + 2]]
      if (![...d, ...v].every(Number.isFinite)) bad++
      lengthError = Math.max(lengthError, Math.abs(Math.hypot(...d) - 1))
      const speed = Math.hypot(...v)
      speedMin = Math.min(speedMin, speed)
      speedMax = Math.max(speedMax, speed)
      for (const b of layout.bodies) {
        const arc = Math.acos(Math.min(1, Math.max(-1, d[0] * b.dir.x + d[1] * b.dir.y + d[2] * b.dir.z))) * R
        if (arc < b.radius * 1.4) insideLand++
      }
      for (let j = 0; j < n; j++) {
        if (i === j) continue
        const arc = Math.acos(Math.min(1, dir[i * 4] * dir[j * 4] + dir[i * 4 + 1] * dir[j * 4 + 1] + dir[i * 4 + 2] * dir[j * 4 + 2])) * R
        if (arc < NEIGHBOUR) neighbours++
      }
    }
    const ok = bad === 0 && lengthError < 1e-4 && insideLand === 0 && speedMin >= 0.0299 && speedMax <= 0.1001
    lines.push(`${label}: ${ok ? 'ok  ' : 'FAIL'} ${n} fish, bad numbers ${bad}, off-sphere ${lengthError.toExponential(1)}, speed ${speedMin.toFixed(3)}..${speedMax.toFixed(3)}, inside land ${insideLand}, neighbours within ${NEIGHBOUR.toFixed(3)}: ${(neighbours / n).toFixed(1)}`)
    panel.textContent = lines.join('\n')
    console.log(lines.at(-1))
    return ok
  }

  let allOk = true
  for (let k = 0; k < 4; k++) {
    allOk = (await sample(`t = ${k * 15} s`)) && allOk
    if (k < 3) await new Promise((resolve) => setTimeout(resolve, 15000))
  }
  window.__fishTest = { allOk, lines }
  return allOk
}
