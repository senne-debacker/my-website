// Constants of the Shadertoy noise, shared by the TSL port and the JS twin so
// the two cannot drift apart. Values copied from the original GLSL.

// const float F3 = 0.3333333;  const float G3 = 0.1666667;
export const F3 = 0.3333333
export const G3 = 0.1666667

// Octave weights of simplex3d_fractal.
export const FRACTAL_WEIGHTS = [0.5333333, 0.2666667, 0.1333333, 0.0666667]

// "directional artifacts can be reduced by rotating each octave"
//   const mat3 rot1 = mat3(-0.37, 0.36, 0.85, -0.14,-0.93, 0.34, 0.92, 0.01,0.4);
//   const mat3 rot2 = mat3(-0.55,-0.39, 0.74,  0.33,-0.91,-0.24, 0.77, 0.12,0.63);
//   const mat3 rot3 = mat3(-0.71, 0.52,-0.47, -0.08,-0.72,-0.68,-0.7,-0.45,0.56);
// GLSL's mat3() is column-major and `m * rot` multiplies a row vector, so the
// rotated vector is (dot(m, col0), dot(m, col1), dot(m, col2)). Stored as columns.
export const ROT1 = [[-0.37, 0.36, 0.85], [-0.14, -0.93, 0.34], [0.92, 0.01, 0.4]]
export const ROT2 = [[-0.55, -0.39, 0.74], [0.33, -0.91, -0.24], [0.77, 0.12, 0.63]]
export const ROT3 = [[-0.71, 0.52, -0.47], [-0.08, -0.72, -0.68], [-0.7, -0.45, 0.56]]
