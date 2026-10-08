# Fisherman — Dredge-style mini-planet boat simulator

University assignment (Expert Creative Development, WebGPU). A small low-poly water planet with a fishing boat on it, rendered with Three.js `WebGPURenderer` and TSL. Art reference: the game *Dredge* (see `../references/`): dusk palette, faceted water, dark pines, warm low sun.

## Assignment requirements (strict — check before every commit)

- [x] Three.js with `WebGPURenderer`. **Never** `WebGLRenderer`. (`main.js` refuses to start without `navigator.gpu` so the WebGL2 fallback is never used silently.)
- [x] Port a Shadertoy fragment shader to **TSL / node materials**. **Never** `ShaderMaterial` / `RawShaderMaterial` / raw GLSL strings.
  - Shader: https://www.shadertoy.com/view/XsX3zB (3D simplex noise, MIT, by Nikita Miropolskiy) → `src/tsl/simplexNoise.js`; shared constants in `src/noiseConstants.js`
- [x] The shader responds to user interaction: keys `1/2/3/4` change the weather (wave height, foam); the boat's wake (position, speed and steering) is drawn into the water by the shader (`tsl/wake.js`); the lamp, anchor and sailing all feed uniforms.
- [x] `README.md` credits the original Shadertoy URL, title and author (nikat / Nikita Miropolskiy, MIT licence, notice included in the README).

## Stack

Vite 8, `three@0.186`, plain JS (ES modules, no TS). Imports: `three/webgpu` (renderer, materials, core classes), `three/tsl` (node functions), `three/addons/...`. Dev server: `npm run dev`. Build: `npm run build`.

## Architecture

```
src/
  main.js              bootstrap: renderer, scene, camera, loop, resize
  config.js            ALL shared constants (planet size, wave params, palette). CPU and GPU both read this
  uniforms.js          shared uniform nodes (time, storm, colours). JS writes .value, TSL reads
  interaction.js       keyboard -> `input` {throttle, steer, anchored, planetView} + weather uniform
  hud.js               the in-game interface: day ring + anchor marker, pill, compass, diamond tools, stat box, strips, toasts
  menu.js              start screen (#start: title, 5 keys, button) and pause screen (#menu: all controls, volumes)
  audio/               audio.js (Web Audio graph: engine/sea/wash/rain layers + one-shots), music.js (generative)
  camera/              chaseCamera.js (follows the sphere frame, ignores wave tilt), introCamera.js (title close-up + swing to the chase pose), cameraRig.js (title/pan -> chase <-> planet orbit)
  scene/               plain Three.js objects: planet.js, lighting.js, boat.js (procedural model), sky.js (dome), clouds.js, rain.js, world.js (assembles islands), terrain.js, props.js, lighthouse.js, buoys.js
  world/               clock.js (time of day), atmosphere.js (keyframes + weather -> lights, fog, sky + water colours), weather.js (state machine), wake.js (trail buffer), layout.js (seeded placement of islands, rocks, buoys)
  physics/             CPU side: simplexNoise.js + waves.js (twin of the waves), boat.js (float pose, also used by buoys), boatMotion.js (rigid-body motion), boatDynamics.js (hull weight springs), islandShape.js (coastline shared by terrain + collision), collision.js
  noiseConstants.js    F3/G3, fractal weights, octave rotations: shared by the TSL port and the JS twin
  debug/               parityTest.js, dev-only, run with `?parity`
  tsl/                 everything TSL
    simplexNoise.js    the Shadertoy port (random3, simplex3d, simplex3dFractal)
    waves.js           waveNoise(dir) + waveAmplitude: the wave field definition
    waterMaterial.js   MeshStandardNodeMaterial: vertex displacement + fragment colour
    lightCone.js       additive TSL material for the bow lamp's light cone
    skyMaterial.js     TSL sky dome: gradient, sun/moon discs, procedural stars
    rainMaterial.js    instanced rain: positions computed in the vertex shader from the instance index and the clock
    wake.js            wakeFoam(dir): foam rings from the boat's trail
    shore.js           shoreFoam(dir): foam bands around islands and rocks
```

## Key design decisions

- **Single clock.** `uniforms.time` is set from JS each frame. Do not use TSL's built-in `time` node for waves; the CPU boat physics must sample the identical time.
- **CPU/GPU parity.** The boat must float on exactly the displaced surface, so the wave function exists twice: TSL (`tsl/simplexNoise.js` + `tsl/waves.js`) and a JS twin (`physics/simplexNoise.js` + `physics/waves.js`). Parameters come from `config.js` only. **Any change to one side must be mirrored on the other**, then re-run `http://localhost:5173/?parity` and check it says PASS.
- **Smooth vs faceted surface.** The CPU samples the continuous noise; the GPU draws flat triangles (piecewise linear between vertices). Measured deviation at triangle centroids (detail 32, radius 5): calm mean 0.0025 / max 0.014, storm mean 0.008 / max 0.047 world units. Fine for a ~0.6-unit boat. If it ever shows, sample the exact triangle on the CPU or raise `PLANET.detail`.
- **Float32 time.** GPU time is float32, so noise precision degrades slowly in long sessions (max noise error 3e-5 after one simulated hour). Not a problem for this project.
- **Hash replaced on purpose.** The Shadertoy's `random3` uses `sin()*4096`, which differs between float32 GPU and float64 JS. We use an integer PCG hash (bit-identical in WGSL and JS via `Math.imul`). Everything else is a line-by-line port. Keep this documented in the README.
- **Low-poly look** = non-indexed `IcosahedronGeometry` + `flatShading: true` (normals from derivatives of the displaced position) + a `flat`-interpolated varying so each triangle has one colour (`WATER.flatColor`).
- **Waves are displaced radially** (`dir * (radius + noise * amplitude)`), so the surface normal for the boat is derived from the gradient of the height field (sample 3 points around the boat, or finite differences on the sphere).

## TSL gotchas hit so far

- Plain JS numbers as the *first args* of `mix` / `smoothstep` / `max` can crash with `this.bNode.getNodeType is not a function`. Wrap in `float(...)`.
- Never do arithmetic on nodes with JS operators (`node + 0.1` becomes a string). Use `.add()`, `.mul()`, ...
- WGSL requires vector shift amounts for vector shifts: use `uvec3(16)`, not `uint(16)`.
- Convert float -> uint via `ivec3` first (negative floats -> uint is undefined).
- Use `vertexStage(node)` to evaluate expensive nodes per vertex and pass them as varyings.
- **Never write `vec3(new Color(hex))`**: it silently evaluates to black (broke the light cones, the rain colour and the moon disc until it was found in step 8). Use `color(new Color(hex))` from `three/tsl`, or a `uniform(new Color())`.
- `smoothstep(edge0, edge1, x)` needs edge0 < edge1 in WGSL; write `float(1).sub(smoothstep(a, b, x))` for a falling edge.

## Verifying without a window

Headless Chrome runs WebGPU on this Mac:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --enable-unsafe-webgpu --use-angle=metal --ignore-gpu-blocklist \
  --enable-logging=stderr --v=0 --window-size=1280,800 --virtual-time-budget=8000 \
  --screenshot=out.png http://localhost:5173/ 2>&1 | grep CONSOLE
```

TSL compile errors show up as `CONSOLE ... THREE.TSL: ...` lines. For key presses, drive Chrome over CDP (`--remote-debugging-port`, `Input.dispatchKeyEvent`).

## Roadmap

Legend: [x] done, [~] in progress, [ ] todo

### Step 0 — Setup
- [x] Vite project, `three` installed, Vite demo removed
- [x] `CLAUDE.md`, `README.md`

### Step 1 — Water planet + Shadertoy port  *(done)*
- [x] TSL port of simplex3d + fractal (`tsl/simplexNoise.js`)
- [x] Icosahedron planet displaced in the vertex stage, coloured in the fragment stage (deep → shallow → foam)
- [x] WebGPURenderer, camera, OrbitControls, placeholder lights, resize, loop
- [x] First interaction: `1/2/3` → `storm` uniform (verified in headless Chrome: waves and foam respond)

### Step 2 — CPU twin of the waves  *(done)*
- [x] `src/physics/simplexNoise.js`: JS port, same constants, `Math.imul` PCG hash
- [x] `src/physics/waves.js`: `sampleHeight(dir, time, storm)`, `surfacePoint(...)`, same math as `tsl/waves.js`
- [x] Parity test (`?parity`): TSL runs in a compute shader, results are read back and compared with JS. Hash is bit-exact (0 mismatches of 12288 values); noise/height max error ≤ 3e-5 (4096 random points, 4 time/storm cases). Negative control done: changing the JS scale 52→51 makes it FAIL.
- [x] Debug marker (red buoy) rides the CPU-computed surface; removed in step 3

### Step 3 — Boat  *(done)*
- [x] Low-poly procedural boat (hull, wheelhouse, mast + pennant, crate, posts, tyres) in Dredge colours (`scene/boat.js`, `BOAT_PALETTE`)
- [x] Float (`physics/boat.js`): 4 wave samples (bow, stern, port, starboard) + centre. Height = mean sample height, up = normal of the plane through the samples. No smoothing, so the pose is exactly what the wave field says
- [x] Heading kept tangent to the sphere, then projected onto the water plane
- [x] Checked in Node over 4000 random states: basis orthonormal (error 1e-15), up == normal. Waterline residual (rigid hull vs bumpy water, at the 5 sample points): calm mean 0.009 / max 0.04, storm mean 0.018 / max 0.11 world units. Visually checked in headless Chrome, calm and storm
- Boat conventions: local +Y up, bow towards -Z. `createBoatState(dir, heading)` is what step 4 will move

### Step 4 — Steering, anchor, camera  *(done)*
- [x] `W/S` throttle (also arrows), `A/D` steer; great-circle movement on the sphere (`physics/boatMotion.js`). Speed eases to the throttle target, coasts with drag, turning needs way on (full authority from 40% of top speed). Tuning constants are in `config.js` (`BOAT`)
- [x] Anchor: `Space` / `X` toggles; brakes the boat to 0 and ignores throttle; slow yaw sway (+-7 deg) while anchored
- [x] Chase camera built from the sphere frame (`dir`, `heading`), **not** the wave-tilted pose, so the horizon stays calm in storms. Wheel zooms. `C` switches to a free orbit camera around the planet centre (OrbitControls is rebuilt on each switch because it reads `camera.up` only at construction)
- [x] HUD hints + status line
- [x] Checked in Node (10 simulated minutes at 60 fps, scripted inputs): |dir|, |heading| and heading-tangent errors 2e-16, distance from positions == integral of speed (635.277 both), lap time matches 2*pi*R/v, D turns to starboard and A to port, no turning without way on, anchor holds the position. Driven in headless Chrome via CDP key events: W, W+D, W+A, Space, X, C, S, wheel all behave
- `window.__game` (dev only) exposes `boatState`, `boatPose`, `input`, `uniforms` for console debugging

### Step 5 — Boat lights  *(done)*
- [x] `SpotLight` on the bow, toggled with `L` (`BOAT_LIGHT` in `config.js`); the target is a child of the boat so the beam follows its pitch and roll. Intensity eases in/out (no shader recompile: the light is always in the scene, only its intensity changes)
- [x] Glowing lamp glass and wheelhouse windows (emissive, eased with the same level)
- [x] Light cone: open cone mesh with an additive TSL material (`tsl/lightCone.js`), opacity = brightest at the lamp, fading along the beam, fading at the silhouette
- [x] The beam lights the displaced, flat-shaded water: each facet gets its own highlight (checked at night in headless Chrome by dimming the sun; also checked in daylight, where the cone is subtle)
- **Planet-size lesson:** radius 5 means the water drops 0.4 at 2 units, 1.6 at 4 units, so a level beam shoots into space and a low chase camera has its horizon right behind the wheelhouse. The beam is aimed ~23 degrees down, and the chase camera is now higher (`CAMERA.height` 3.2, look-ahead 1.8). Keep this in mind for anything placed far from the boat (islands, buoys must be near the camera's visible patch)
- Lights default to OFF; the HUD hints "it is getting dark (L)" at dusk (Step 6). The dimmed-sun test hack is no longer needed: use `__game.clock.timeOfDay = 0.92` instead

### Step 6 — Day/night cycle  *(done)*
- [x] Clock (`world/clock.js`): 210 s per day, starts 17:00 with the sun low ahead; hold `T` to fast-forward x14; `HH:MM` in the HUD
- [x] Sun and moon (opposite) orbit on a great circle (`DAY.east`/`DAY.noon`); one DirectionalLight each, so the planet has a real day side and night side
- [x] **Mood is keyed on the sun's elevation at the boat** (`SKY_KEYS` in `config.js`: night, blue hour, sunset, golden hour, day): sky colours, sun tint/intensity, moon intensity, hemisphere fill, stars, fog colour, water palette. Sail round the planet and your local time of day changes. HemisphereLight is aimed along the boat's local up
- [x] TSL sky dome (`tsl/skyMaterial.js`): horizon->zenith gradient, sun halo + disc (disc tinted by the sun colour), moon disc, procedural twinkling stars (GPU-only hash, no CPU twin needed)
- [x] Haze: `FogExp2` coloured with the horizon colour; off in planet view
- [x] Planet view: sky becomes space (stars), planet is lit by the real sun with the day palette, smaller halo, no fog (eased by `spaceAmount`)
- [x] HUD hint "it is getting dark (L)" when the sun is down and the lamp is off
- **Planet-size lesson 2:** the planet's visible edge is ~50 degrees below the horizontal from the chase camera, so the sky gradient starts at that edge (`uniforms.horizonDip`) instead of the flat horizon. Camera FOV is 55, `CAMERA.lookAhead` 2.6
- Verified in headless Chrome at 12:00, 17:00, 17:52, 18:07, 19:12, 21:36, 06:43 and in planet view by day and night; `T` fast-forward and midnight wrap checked; parity test still PASS
- Debug: `__game.clock.paused = true; __game.clock.timeOfDay = 0.9` freezes/sets the time; `__game.atmosphere.state` shows the current blend

### Step 7 — Weather + boat wake  *(done)*
- [x] Weather state machine (`world/weather.js`): automatic cycle clear -> overcast -> storm -> clearing (random durations, `WEATHER.cycle`), keys `1/2/3` = manual calm/breezy/storm, `4` = back to auto. Three levels `storm` (waves/foam), `cover`, `rain` ease towards the target (about 8 s to 90%) and are written to `uniforms`. `uniforms.storm` still drives the CPU wave height, so the boat follows
- [x] Atmosphere reacts (`world/atmosphere.js`): cover greys and darkens sky/water, cuts sun and moon, hides stars, thickens haze; the sky shader hides the sun/moon disc behind cover
- [x] Low-poly clouds (`scene/clouds.js`): 30 squashed lumpy icosahedron clusters on a shell, drifting; each has a cover threshold so a front builds up. Colour from `uniforms.cloudColor` (white -> dark grey by storm). Shrunk in planet view
- [x] Rain (`scene/rain.js` + `tsl/rainMaterial.js`): 2600 instanced streaks, positioned entirely in the vertex shader (random spot around the boat, falls *towards the planet centre*, `step(random, rain)` collapses streaks for light rain), fades near the camera and in planet view, no fog
- [x] Boat wake (`world/wake.js` + `tsl/wake.js`): the last 64 stern positions (every 0.1 s) live in a `uniformArray`; the water shader loops over them and adds an expanding Gaussian foam ring per point. The rings pile up into a V behind the boat; strength follows speed, so an anchored boat leaves none. Colour only (no displacement), so no CPU twin is needed and parity is unaffected
- [x] Checked: weather cycle simulated in Node (10 min: sensible order and durations); manual storm reaches 90% in 7.7 s; headless Chrome screenshots of clear, storm (rain + clouds), night storm, wake straight/turning/planet view; **60 fps** in a storm with rain, clouds and wake; parity test still PASS
- Tuning notes: wake `strength` 0.2 (0.5 turned the whole sea white in a tight turn: rings from neighbouring points add up); storm foam threshold 0.24 (0.1 looked like snow); clouds at altitude 6..8.5 (lower ones filled the sky and clipped the camera)
- Known: in a night storm everything is very dark (intended); the rain does not catch the lamp light

### Step 8 — World dressing  *(done)*
- [x] Deterministic layout (`world/layout.js`, `WORLD` in `config.js`): 3 hand-placed landmarks near the start (lighthouse, pine isle, autumn isle, given as bearing + distance from the start) + 7 scattered islands, 14 sea rocks, 9 buoys; no overlaps, clear of the start
- [x] Low-poly islands (`scene/terrain.js`): polar grid on the sphere (10 rings x 28 segments), plateau profile + simplex noise, wobbly coast, rim well below the waves, non-indexed with one colour per triangle (sand / cliff / grass-autumn-rock top)
- [x] Props (`scene/props.js`, `scene/world.js`): pines, autumn trees, rocks as merged geometries with baked vertex colours, one InstancedMesh per kind with per-instance tints
- [x] Lighthouse (`scene/lighthouse.js`): striped tower, glowing lantern, rotating SpotLight + two additive cones; on at night and in storms (`darkness`)
- [x] Buoys (`scene/buoys.js`): float on the CPU wave function with the boat's plane-fit (`computeBoatPose` now takes a footprint), blink at night
- [x] Collisions (`physics/collision.js`): islands (shoreline x 1.15 + 0.3) and rocks are circles on the sphere; the boat is pushed out to the rim and slides along it, losing speed with the head-on-ness; HUD shows "BUMP!". Node test: 461,760 frames fired at every collider from random directions, 0 frames inside, 0 NaN, ~940 runs slid on and kept moving
- [x] Shore foam in the water shader (`tsl/shore.js`): `uniforms.shoreBodies` (32 slots) -> a band from the shoreline outwards with lapping rings, drawn per triangle like the other foam
- [x] Verified in headless Chrome: start view, golden hour, night with beams, storm, planet view (terminator, islands, foam rings), sailing into an island; 60 fps in a storm with everything; parity still PASS
- **Bug found and fixed:** `vec3(new Color(hex))` evaluates to black in TSL. It made the light cones invisible, the rain streaks dark, and the moon a dark disc. All three now use `color(...)`. See "TSL gotchas"
- Tuning notes: coast wobble is +-14%, so the collider uses radius x 1.15; shore band 0.4 wide at strength 0.7 (0.55 / 0.85 looked like a white wash around every island); lighthouse beam 0.38, boat cone 0.3
- Known: islands read as tall pillars from planet view (heights 0.5-1.2 on a radius-5 planet); tweak `height` in `WORLD.landmarks` / the scatter in `layout.js` if you want them flatter

### Step 9 — Polish + delivery  *(done)*
- [x] Post-processing (`src/post.js`): `RenderPipeline` with a multisampled scene pass, `bloom` (HDR threshold 1.0, so only the sun, lamps and glints glow) and a TSL vignette, then tone mapping. `P` toggles it; 60 fps with it on
- [x] HUD: compass (the dial turns, the bow marker stays up; heading from the sphere frame, north = towards +Y), clock, weather / speed / anchor / lamp / camera status
- [x] Loading overlay (removed after the first frame) and error handling (no WebGPU, or any startup failure, shows a message instead of a blank page)
- [x] Favicon, page description, `vite.config.js` (`base: './'` so `dist/` works from any folder; chunk warning limit raised, three.js is ~1 MB)
- [x] README: screenshots (`docs/screenshots/`), GLSL-to-TSL translation guide, controls, credits, MIT notice
- [x] Production build served with `vite preview` and driven in headless Chrome: loads, no error, controls work, parity test PASS in the built bundle
- Not tested: Safari 26 and Firefox (no way to run them here). Chrome only

### Step 10 — Final tweaks after review  *(done)*
User asked for: start/pause screen, better driving interface, heavier boat, horn, correct island collisions, sound + music, a more distinct wake. (No inspiration image arrived with the message; the Dredge HUD screenshots in `references/` were the style guide.)
- [x] **Start / pause screen** (`menu.js`, `#menu` in `index.html`): title, key reference in two columns, music/effects sliders, "Set sail" / "Resume". Game state machine in `main.js` (`menu` -> `playing` <-> `paused`); while not playing `sim` is 0 so the boat, clock and weather hold still but waves, clouds and the hull's bobbing carry on behind the blur. `Esc` pauses, so does losing window focus. The click on "Set sail" is what unlocks audio
- [x] **Interface** (`hud.js`, `style.css`): Dredge-style, see README. Scales with window height (`--ui`). Toasts for lamp / anchor / bump / mute / "getting dark". Speed is shown as vel.length() * 5 knots (cosmetic)
- [x] **Weight** (`physics/boatDynamics.js`): hull follows the waves through two damped springs (heave 3.0 rad/s zeta .75; tilt 2.4 rad/s zeta .55), plus outward lean in turns and pitch from acceleration. Config in `BOAT.weight`. Measured: vertical acceleration RMS 15x lower, tilt speed 2.3-3.8x lower, hull lags the water by 2-5 cm (max 17 cm in a storm). Buoys still use the exact pose
- [x] **Motion model** (`physics/boatMotion.js`): the boat now has a velocity *vector*, not just speed + heading. Engine acts along the hull (acceleration 0.65), keel kills sideways slip (grip 5/s) so it drifts up to ~15 degrees in a turn, the helm sets a target yaw rate that the boat follows with inertia (response 2.6/s)
- [x] **Collisions rebuilt** (`physics/islandShape.js`, `physics/collision.js`): the old circle + instant push-out made the boat jump. Now the terrain and the collision share one island definition, and the collider is the *real* shoreline (table of 72 distances, dilated and blurred, slope-clamped normal). Response: restitution 0.25, Coulomb friction 0.35, torque from the hull point that touched (a glancing bow hit swings the bow away), soft radial push-out (max 0.12 per frame). Live test in the browser, every frame of a run into the lighthouse island: deepest overlap 0.01, largest move beyond velocity 0.011
- [x] **Horn** (`H`, held): brass horn on the wheelhouse roof that trembles while it sounds; synthesised foghorn (`audio.horn`)
- [x] **Sound** (`audio/`): everything synthesised with Web Audio, no files. Continuous layers driven every frame (engine silent at rest and rising with speed, wash likewise, sea swells with the storm, rain follows rain), one-shots for lamp / anchor / bump / horn, generative music (Dm - Bb - F - Csus2 pads + pentatonic plucks, echo, reverb) or `public/audio/music.mp3` if present. Volumes saved in localStorage; `M` mutes; pause ducks music and silences the layers; planet view low-passes them. Verified without listening via analysers (`__game.audio.levels()`): engine and wash exactly 0 at rest, rising with speed (0.065 -> 0.146 and 0.018 -> 0.131 from 0.6 to 1.7 u/s), rain 0.13 in a storm and gone when it clears, horn / lamp / anchor / bump register, pause ducks music to ~40%, mute gives master 0
- [x] **Wake detail** (`tsl/wake.js`, `tsl/waterMaterial.js`): added propeller wash (continuous strip behind the stern) and bow splash; the wake value is now interpolated smoothly (not `flat`) and broken up per pixel with the ported `simplex3d`, then cut sharply: lacy, bright foam (colour x1.25) with a lighter aerated halo. Tuned numbers in `WAKE`
- [x] `npm run check` (`tests/physics.check.mjs`): 19 checks of motion, collisions and weight
- Tuning notes: lamp glass emissive 1.6 (3.0 made a big flare with bloom); horn gain 0.24 (0.5 was 9x the music); wash gain 0.62
- Known / not done: sounds were checked with level meters, not by ear, so the mix (especially music) is untested by a human. Safari/Firefox untested

### Step 11 — Start screen redesign  *(done)*
- [x] Start screen is now minimal: a close-up of the boat (the real 3D scene) with the title above it, five key hints (W/S, A/D, Space, H, Esc "All controls") and "Set sail". The full control list and the volume sliders live on the pause screen only (`#start` vs `#menu` in `index.html`, `menu.js`)
- [x] Title camera + swing (`camera/introCamera.js`, `INTRO` in `config.js`): the camera is described in the boat's sphere frame (azimuth round the boat, radius, height, look-at, fov). Title view: 58 degrees round to port, radius 3.1, height 1.05, fov 38, slow sway. "Set sail" blends it to the chase camera's exact pose (azimuth 180, `CAMERA.*`, fov 55) over `INTRO.panSeconds` (2.8 s) with a cubic ease, then `chase.snap()` hands over with no jump
- [x] Game states `menu -> starting -> playing <-> paused` in `main.js`. While not playing, `sim` is 0 (boat, clock, weather frozen; waves, clouds, bobbing run). Keys are ignored on the title and during the swing; the HUD fades in when the camera arrives; the music fades in over 3.5 s from the button press; wheel zoom is ignored until the swing is done
- [x] Verified by clicking through in headless Chrome (title, W and Esc ignored, swing fov 39 -> 45 -> 53 -> 55, playing, sail, pause, resume, no console errors); framing checked at several window sizes
- Tuning note: the title framing was iterated (first the mast hit the title, then the hull sank behind the keys); numbers in `INTRO`

### Step 12 — Mute fix  *(done)*
- [x] Bug: `M` did nothing on the title and pause screens (the key handler returned early while the game was not "playing"; the pause screen even lists M), and on AZERTY keyboards it did nothing anywhere (the code matched `event.code`, the physical position: the key labelled M is `Semicolon` there). Reproduced with real key events and the audio output level before fixing
- [x] Fix (`interaction.js`): `M` is handled before the "enabled" check, so it works on every screen. Letter keys are identified by `event.key` (what is printed on the key) via `label(event)`; digits, Space, Escape and arrows by `event.code`. Movement tracks both, so on AZERTY the keys labelled WASD and those in the WASD position both steer. Punctuation printed on a letter position (AZERTY "," at the QWERTY M spot) is not a letter key, and Cmd/Ctrl/Alt combos are ignored
- [x] A **Sound button** (`#sound-button`, top right) on the start and pause screens: shows "Sound on" / "Sound off" with the M key, is clickable, and blurs itself after a click so Space/Enter cannot press it again. In the game the right-hand M strip and a toast show the state. The setting is saved, and a mute made on the title screen is still muted after "Set sail"
- [x] Verified with real key events on both layouts, on all three screens (title, playing, paused): `muted` flag, master output level 0 when muted and back when not, button label; "," and Cmd+M do not mute; W/S/A/D on QWERTY and both AZERTY positions, L, Space, 3, unshifted AZERTY digit, H still work

## Final requirements check (re-run before handing in)

```
cd fisherman
grep -rnE "WebGLRenderer|ShaderMaterial|RawShaderMaterial|from 'three'|vec3\(new Color" src index.html   # expect no output
grep -n "shadertoy.com/view/XsX3zB" README.md src/tsl/simplexNoise.js                                  # expect both files
npm run build                                                                                           # expect "built", no errors
npm run check                                                                                           # expect "all checks passed"
# in the browser: http://localhost:5173/?parity -> "GPU vs CPU parity: PASS"
```

1. Three.js `WebGPURenderer`, never `WebGLRenderer`: yes (`main.js`; startup refuses to run without `navigator.gpu`)
2. Shadertoy shader ported to TSL node materials, no `ShaderMaterial`/`RawShaderMaterial`: yes (`tsl/simplexNoise.js` -> `tsl/waterMaterial.js`)
3. Shader responds to user interaction: yes (weather keys, wake from sailing, anchor, lamp, time)
4. README names the Shadertoy URL: yes, at the top and in the shader file headers; author, title and MIT licence credited

## Progress log

- 2026-10-08: Step 12: `M` (mute) now works on every screen and on AZERTY keyboards; Sound button on the start and pause screens.
- 2026-10-08: Step 11 complete: minimal start screen over a close-up of the boat, camera swing to the chase view on start.
- 2026-10-08: Step 10 complete (review tweaks): start/pause screen, Dredge-style HUD, heavier boat, real-shoreline collisions, horn, synthesised sound + music, distinct wake, `npm run check`.
- 2026-10-08: Step 9 complete. Bloom + vignette, compass HUD, loading/error screens, README with screenshots and translation guide, production build verified. All roadmap steps done.
- 2026-10-08: Step 8 complete. Islands, trees, lighthouse, buoys, collisions, shore foam. Found the `vec3(new Color())` bug (invisible beams, dark rain, black moon) and fixed it everywhere.
- 2026-10-08: Step 7 complete. Weather, clouds, rain and wake work at 60 fps. The first wake attempt was far too strong (rings overlap and add up); retuned.
- 2026-10-08: Step 6 complete. Day/night cycle, TSL sky, fog, moon, stars, planet-view lighting. Colour keyframes are tuned by eye against the Dredge screenshots and can be adjusted in `SKY_KEYS`. Not done: clouds (Step 7), and the boat is still dark from behind at sunset (backlit on purpose).
- 2026-10-08: Step 5 complete. Spotlight, glow and cone work. Night looked pitch black in the test because the placeholder lighting has no moon/ambient; Step 6 owns that. Test trick: in the console set `__game.lights.sun.intensity = 0` and `__game.lights.fill.intensity = 0.5`, then press L.
- 2026-10-08: Step 4 complete. Boat sails, anchors, chase camera + planet view work. Known: with the placeholder fixed sun the boat's shaded sides look very dark from behind; Step 6 (day/night + proper lighting) fixes it. Handling numbers are a first guess, tune by feel.
- 2026-10-08: Step 3 complete. Boat floats and tilts with the waves (calm + storm checked visually). Camera is an OrbitControls around the boat for now. Lighting is still the placeholder sun + hemisphere (shaded sides are dark); Step 6 will fix it.
- 2026-10-08: Port verified against the original GLSL (pasted by the user). Found and fixed one error: the per-octave rotations (`rot1..3`) of `simplex3d_fractal` were missing. Everything else matched. Parity re-run: PASS (hash exact, max height error 3e-5).
- 2026-10-08: Step 2 complete. CPU twin matches the GPU (see Step 2). Test was run in headless Chrome; the buoy was checked visually in calm weather only.- 2026-10-08: Step 0 and Step 1 complete. Water planet renders on WebGPU, TSL compiles, flat per-triangle colour works, storm keys change waves and foam.
