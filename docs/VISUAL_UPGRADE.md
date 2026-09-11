# Visual upgrade 0.4

The old six-box queen could not produce a realistic silhouette. This release replaces
it with a reproducible Blender mesh: 64-segment turned porcelain body, layered base,
three gold inlays, crown cup, eight crown pearls, jade cushion, and central finial.
The source scene includes a camera and three area lights for the transparent token.

Implementation and logic review:

1. Generate editable .blend, portable .glb, shared position/normal geometry, and PNG.
2. Preserve visible-board-only export, region metadata, Y-up coordinates, and metallic
   and roughness properties. No solution data is added to the renderer.
3. Load Three.js only when opening the viewer. Render on demand, cap pixel ratio,
   reuse the WebGL context, and dispose replaced geometry/materials.
4. Keep model inspection separate from game state and scene export. If WebGL is
   unavailable, the 2D game and downloadable scene remain available.
5. Validate puzzle logic, browser interactions, mesh bounds, and Khronos glTF output;
   visually inspect both the full board and close-up before deployment.

This is a polished stylized-realistic chess piece, not a claim of AAA production
quality. Further art direction could add authored stone/wood textures, sculpted
ornament with baked normal maps, and mobile LODs after device profiling. Those are
future work; this release avoids heavy textures and continuous rendering.
