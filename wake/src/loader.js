// The loading screen (markup in index.html, look in style.css). Start-up has stages; each one
// reports how far along it is. The screen stays until the GPU shaders are compiled and a few
// frames have been drawn underneath it, so the game never appears half-drawn.
const fill = () => document.getElementById('loading-fill')
const label = () => document.getElementById('loading-label')

// Gives the browser a chance to paint the new stage before the next heavy, blocking step starts.
export const paint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

export function createLoader() {
  const startedAt = performance.now()
  return {
    async stage(progress, text) {
      fill().style.width = `${Math.round(progress * 100)}%`
      label().textContent = text
      await paint()
    },
    // Fade the screen out. Never faster than `minSeconds` after the page opened, so it does not
    // flash by on a fast machine.
    async finish(minSeconds = 1) {
      const wait = minSeconds * 1000 - (performance.now() - startedAt)
      fill().style.width = '100%'
      label().textContent = 'Ready'
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      document.getElementById('loading').classList.add('done')
    },
  }
}
