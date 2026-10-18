Optional: your own dolphin model.

Export it from Blender as glTF Binary (.glb) and save it here as  dolphin.glb.
The game loads it automatically; without the file a low-poly dolphin built in code is used.

- No rigging is needed: the model is bent along its body in the vertex shader (a tail beat).
- The size, centre and axis are fixed on load: the model is scaled to DOLPHIN.length (src/config.js).
- Which way the nose points in the file is DOLPHIN.nose in src/config.js ([0, 0, 1] = +Z, which is what
  Blender's glTF export gives for a model facing -Y, Blender's "front").
- Each mesh keeps its base colour and colour texture; other material settings are replaced.

----------------------------------------------------------------------------------------------
Optional: your own boat.  Save it here as  boat.glb  and it replaces the built-in boat.

Start from  blender/wake-boat.glb  (in the project root): File > Import > glTF 2.0 in Blender.
That is the current boat, every part named, so you can edit it or model a new one next to it.

Rules for the model (Blender, Z up):
- Bow towards +Y in Blender (glTF export turns that into -Z, which is what the game uses).
  Keel along the Y axis, boat centred on X and Y.
- Z = 0 is the waterline. The game lifts the whole boat a little (BOAT.rideHeight).
- Any size: the model is scaled so its length is BOAT.length (0.9 units). Turn that off with
  BOAT.model.fitLength in src/config.js. The physics hull (collisions, wave sampling) is the
  built-in size, about 0.9 long and 0.38 wide: a much wider boat will look as if it clips islands.
- Export: File > Export > glTF 2.0, format glTF Binary (.glb), "+Y Up" ticked, Apply Modifiers ticked.
  Keep it low-poly; the game applies flat shading (BOAT.model.flat).
- Names the game looks for (everything else is just drawn):
    object "Horn..."          trembles while the horn (H) sounds; a child "Bell..." swells and shrinks
    materials "Window..."     glow when the bow lamp is on (their Emission colour; without one a warm colour is used)
    materials "Lamp..."       the same, a bit brighter
- The bow lamp's light and its beam are not part of the model: they sit at BOAT_LIGHT.lampPosition
  in src/config.js ([0, 0.27, -0.33]: on the centre line, 0.27 up, 0.33 ahead of the middle).
  Move that if your boat's bow is somewhere else.
- Only colours and base-colour textures are used from the materials (the game's lighting does the rest).
