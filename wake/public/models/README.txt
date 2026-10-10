Optional: your own dolphin model.

Export it from Blender as glTF Binary (.glb) and save it here as  dolphin.glb.
The game loads it automatically; without the file a low-poly dolphin built in code is used.

- No rigging is needed: the model is bent along its body in the vertex shader (a tail beat).
- The size, centre and axis are fixed on load: the model is scaled to DOLPHIN.length (src/config.js).
- Which way the nose points in the file is DOLPHIN.nose in src/config.js ([0, 0, 1] = +Z, which is what
  Blender's glTF export gives for a model facing -Y, Blender's "front").
- Each mesh keeps its base colour and colour texture; other material settings are replaced.
