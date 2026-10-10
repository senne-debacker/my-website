// Quality level, decided once when the page loads. Phones and tablets get the low setting: the
// game draws a lot per pixel (waves, wake, rain, fish shadows) and a phone screen has many pixels.
//   low   render at a pixel ratio of 1 (a 3x phone screen would otherwise be 9 times the pixels
//         of the layout size, 4 times at the old cap of 2) and without the wake's wave pattern
// `?low` forces the low setting (to test it on a desktop), `?high` forces the full one.
const params = new URLSearchParams(location.search)
const touchDevice = !params.has('desktop') && (params.has('touch') || matchMedia('(pointer: coarse)').matches)
const low = params.has('low') || (touchDevice && !params.has('high'))

export const QUALITY = {
  low,
  pixelRatio: low ? 1 : Math.min(devicePixelRatio, 2),
  wakeWaves: !low, // the Shadertoy wake's per-pixel wave sum (tsl/wakeWaves.js)
}
