import { ConeGeometry, Mesh, MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, Color } from 'three/webgpu'
import { float, uniform, positionLocal, positionView, normalView, color } from 'three/tsl'

// Soft volumetric-looking beam: an open cone drawn with additive blending. The
// apex sits at the origin and the cone opens along -Y (the caller rotates it).
// The opacity is a TSL graph:
//   brightest at the lamp, fading along the beam   -> (1 - t)^1.6
//   fading towards the silhouette, so the hard cone edge disappears
//                                                  -> |normal . view|^1.5
// `level` (0..1) is the on/off switch that eases in from JavaScript.
export function createLightCone({ length, angle, color: beamColor, strength }) {
  const level = uniform(0)

  const geometry = new ConeGeometry(Math.tan(angle) * length, length, 32, 1, true)
  geometry.translate(0, -length / 2, 0)

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false, // never hide things behind the beam
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false, // the fog colour would be added on top of the beam
  })

  const t = positionLocal.y.negate().div(length) // 0 at the lamp, 1 at the far end
  const along = float(1).sub(t).pow(1.6)
  const facing = normalView.dot(positionView.negate().normalize()).abs() // 1 face-on, 0 at the rim
  material.colorNode = color(new Color(beamColor))
  material.opacityNode = along.mul(facing.pow(1.5)).mul(strength).mul(level)

  const mesh = new Mesh(geometry, material)
  mesh.name = 'light-cone'
  mesh.frustumCulled = false
  mesh.renderOrder = 1 // after the opaque water and hull
  return { mesh, level }
}
