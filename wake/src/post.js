import { RenderPipeline } from 'three/webgpu'
import { pass, screenUV, float, vec4, smoothstep } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { POST } from './config.js'

// Post-processing, all TSL nodes:
//   scene pass  -> HDR colour (the scene is rendered once into a texture)
//   bloom       -> bright things (sun, lamps, lantern, glints) bleed light; works on the
//                  HDR values, before tone mapping, so only really bright pixels glow
//   vignette    -> darkens the corners a little
// The pipeline applies tone mapping and the colour-space conversion at the end.
export function createPostProcessing(renderer, scene, camera) {
  const pipeline = new RenderPipeline(renderer)

  const scenePass = pass(scene, camera) // multisampled like the main canvas
  const color = scenePass.getTextureNode('output')
  const glow = bloom(color, POST.bloomStrength, POST.bloomRadius, POST.bloomThreshold)

  const corner = smoothstep(float(POST.vignetteStart), float(POST.vignetteEnd), screenUV.sub(0.5).length())
  const vignette = float(1).sub(corner.mul(POST.vignetteStrength))

  const lit = color.add(glow)
  pipeline.outputNode = vec4(lit.rgb.mul(vignette), lit.a)

  return { render: () => pipeline.render() }
}
