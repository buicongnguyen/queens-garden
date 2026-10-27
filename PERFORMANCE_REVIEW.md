# Queen's Garden performance review

Review date: 2026-10-25 (Asia/Seoul). The review and optimization were initially
local only. Publication as version 0.4.1 was subsequently authorized on 2026-10-28.

## Scope and method

Used the requested `smooth-dense-scenes` skill from
`C:\Users\n\.claude\skills\smooth-dense-scenes\SKILL.md` (the supplied path omitted
the separator before `.claude`), including its CPU/buffer and Three.js recipes.
Inspected the installed Three.js **0.186.0**, especially Object3D matrix propagation,
WebGLAttributes upload ranges, and WebGLShadowMap invalidation before adapting them.

This is a DOM-based puzzle with an optional, **on-demand** WebGL preview, not a
continuous 3D action game. Gameplay, timer, CSS animations, controls, solution logic,
and Blender artwork remain unchanged. There is no particle system to optimize;
introducing particles or reducing effect density would be unrelated to this task.

`scripts/profile-garden.mjs` compares the original renderer from commit `aebdde7`
with the local source in one page. It bundles temporary, unminified virtual modules
and serves them only on localhost. No profiling globals enter the production bundle.
The original renderer receives the default world-space scene representation; the
optimized renderer receives the compact representation. Timing covers renderer
submission, not the scene builder or entire UI event handler.

Fixtures: fixed level 1, sizes 7 and 15, one queen in each diagonal cell. This is an
intentional rendering fixture, not a claimed valid puzzle solution. Warm the renderer,
rotate from 35° to 45°, repeat an unchanged request, then replace R1C1 with a mark.
Restore the initial board and exercise board → inspector → empty board → board three
times. Unit tests additionally fill all 225 cells with queens to check batch capacity.

Environment:

- Windows, Playwright-controlled Edge, **ANGLE SwiftShader software WebGL**.
- Desktop: 1280×900 viewport, DPR 1; drawing buffer 720×480.
- Phone emulation: 390×844, touch/mobile mode, DPR 2, CPU throttled 4×;
  drawing buffer 1440×960. This is not a physical phone or mobile GPU.
- Same antialiasing, full-detail geometry, materials, lighting, camera, 2048² shadow
  map, tone mapping, and DPR cap in both arms. No adaptive quality reduction.
- Raw WebGL draw functions count **all passes, including shadows**, rather than
  relying on Three.js's reset-per-pass draw counter. Matrix4 composition and
  multiplication are counted separately. Buffer allocations/deletions and upload
  bytes are tracked, including WebGL2 element-offset/length semantics.
- Counter wrappers are removed during 12 interleaved timing pairs and same-code
  control pairs. These timings remain diagnostic, not GPU frame-time measurements.

## Findings and implemented changes

1. **Repeated geometry and draw submission:** the old renderer made one mesh and
   material per tile and per queen part. Batch identical shapes by exact color,
   metalness, and roughness using `InstancedMesh`. Keep porcelain, gold, and jade
   separate; do not merge finishes or simplify the 5,840-vertex queen.
2. **Full rebuild on every board change:** retain compatible batches and the floor.
   A move updates instance translations/counts instead of destroying all resources.
   Remove obsolete batches with explicit instance-buffer, geometry, and material
   disposal. Capacity is bounded to the game's 225 cells per batch.
3. **Unnecessary shadow passes:** cache the fixed-light shadow map during camera
   rotation. Board/inspector/size changes and context restoration invalidate it.
   No shadow caster is removed. With a changed board, triangle submissions are equal
   before/after; the lower rotation triangle count comes from reusing shadows.
4. **Static transforms:** disable automatic local matrix composition only on the
   known-static root, group, light, floor, and batches. Initialize their matrices
   explicitly. Preserve Three.js world traversal/parent propagation and leave the
   camera dynamic. This is not an engine-wide prototype patch.
5. **Selective uploads:** compare instance values at Float32 precision; mark only a
   bounded dirty component range. Union pending ranges before clearing metadata so
   culled work cannot be lost. Recompute bounds when translations/counts change.
   Clear pending ranges only after actual upload, including r186's initial
   `bufferData` path. Count-only shrink does not upload an unused tail.
6. **CPU allocation:** compact preview data shares the queen's source arrays instead
   of allocating translated copies for every queen. Export remains world-space and
   accepts both representations; the resulting glTF is deep-equal in unit tests.
7. **Redundant/hidden rendering:** identical scene-and-angle requests return without
   rendering. Closed menus and non-game tabs do not build or draw hidden previews.
   Reopening updates the board correctly. Existing idle behavior was already good.

## Measured work reductions

The following counts matched in desktop and phone-emulation runs. Bytes are decimal
bytes, not MiB. Each row is one requested operation, not a continuous frame average.

| Metric | 7×7 before | 7×7 after | 15×15 before | 15×15 after |
|---|---:|---:|---:|---:|
| Rotation: raw draws including shadows | 143 | 12 | 543 | 20 |
| Rotation: triangles submitted | 180,530 | 90,266 | 458,162 | 229,082 |
| Rotation: Matrix4 compositions | 85 | 5 | 286 | 6 |
| Rotation: Matrix4 multiplications | 221 | 14 | 821 | 22 |
| Rotation: GPU buffer upload bytes | 0 | 0 | 0 | 0 |
| Identical repeat request: draws | 143 | 0 | 543 | 0 |
| Board edit: raw draws including shadows | 139 | 25 | 539 | 41 |
| Board edit: triangles submitted | 159,626 | 159,626 | 437,258 | 437,258 |
| Board edit: Matrix4 compositions | 82 | 9 | 284 | 11 |
| Board edit: Matrix4 multiplications | 215 | 29 | 815 | 45 |
| Board edit: `bufferData` calls | 211 | 4 | 811 | 4 |
| Board edit: `bufferData` bytes | 2,696,972 | 43,200 | 9,403,148 | 43,200 |
| Board edit: `bufferSubData` calls | 0 | 3 | 0 | 3 |
| Board edit: `bufferSubData` bytes | 0 | 996 | 0 | 2,532 |
| Restored board: resident GPU buffer bytes | 2,873,228 | 593,996 | 9,579,404 | 939,596 |
| Restored board: renderer geometry count | 72 | 12 | 272 | 20 |
| Renderer texture count | 4 | 4 | 4 | 4 |
| Renderer program count | 3 | 3 | 3 | 3 |

For 15×15 this is **96.3% fewer rotation draws**, **99.5% fewer bytes transferred
on the measured edit** (9,403,148 → 45,732), and **90.2% fewer resident buffer bytes**.
The new mark batch explains the four fresh allocations; subsequent compatible edits
reuse existing storage. Removing the first queen compacts the remaining slots, so
the upload range legitimately includes more than one instance. No claim of zero
uploads during normal editing is made.

Idle over 250 ms: **zero draws, matrix operations, and uploads in both versions**.
There is no newly earned idle FPS or battery improvement to claim.

## CPU timing and FPS limits

Median `drawGarden` wall times, in milliseconds, with operation wrappers removed:

| Fixture | Original | Optimized | Same optimized code, control A / B |
|---|---:|---:|---:|
| Desktop 7×7 | 1.2 | 0.4 | 0.3 / 0.2 |
| Desktop 15×15 | 3.3 | 0.4 | 0.3 / 0.1 |
| Phone emulation 7×7, CPU 4× | 2.6 | 1.2 | 0.5 / 0.3 |
| Phone emulation 15×15, CPU 4× | 22.3 | 2.3 | 1.1 / 0.5 |

These are small-sample JavaScript/driver-submission timings, not completed GPU work.
The null controls show considerable relative variation at these small durations;
do not turn these ratios into a promised speedup. The deterministic operation and
transfer counts are the stronger result. Software rendering, CPU throttling, and
an on-demand preview do **not prove desktop/mobile FPS, thermals, battery life, or
real-device frame-pacing improvements**. No FPS improvement is claimed.

## Memory and lifecycle

GPU-buffer bytes are tracked live allocations minus deletes; they exclude texture
storage, render targets, driver overhead, and total process memory. Geometry counts
include the renderer's own retained geometry. Across all three return cycles, the
15×15 optimized scene returned to **20 geometries, 3 programs, 939,596 buffer bytes**
on both viewport configurations. This is a bounded lifecycle check, not proof of
absence of every possible long-session leak.

Chromium's sampled JS heap with **both benchmark arms resident in the same page**:
desktop 101,346,577 used / 178,326,113 allocated; phone-emulation 28,698,516 used /
31,299,352 allocated. GC timing and shared allocations make these unsuitable for
per-version subtraction. No measured whole-heap reduction is claimed. Compact
data sharing is independently verified by reference-identity and export tests.

## Visual preservation

Used the skill's `pixel-diff.mjs` at threshold **0** on aligned 15×15 canvas captures:

| Capture | Changed pixels | Maximum channel delta |
|---|---:|---:|
| Desktop before/after, 720×480 | 7 / 345,600 (0.002%) | 29 |
| Phone before/after, 748×500 capture pixels | 67 / 374,000 (0.018%) | 19 |
| Desktop same-build control | 0 | 0 |
| Phone same-build control | 0 | 0 |

These tiny differences are consistent with Float32 world-space geometry becoming
local geometry plus instance translations and exact box dimensions. The result is
not pixel-identical, but no material detail/finish/shadow/resolution was removed;
desktop output was also visually inspected. An initial stacked-canvas phone capture
had different fractional CSS origins and gave a false large difference. The harness
now captures each canvas at the same origin; that invalid comparison was discarded.

## Focused correctness checks

- 28 unit tests passed, including existing engine/session rules and four new batching
  tests: shared geometry/export equivalence; stable Float32 and pending uploads;
  shrink, replacement, empty/refill; parent movement/rotation/scale/reparenting and
  explicit matrix updates; capacity/finish preservation with 225 queens.
- 13 browser tests passed: rotation/export validation, WebGL fallback, undo/redo,
  daily/score behavior, touch cancellation, drag grouping, mobile scrolling, focus
  cycling, server boundaries, desktop/phone hidden-menu and changed-board checks,
  and real context loss/restoration with a pixel-identical restored studio-lit scene.
- Syntax checks and the local production renderer build passed.
- The benchmark enforces draw/upload/memory budgets and checks lifecycle return
  values for future runs. Existing controls and CSS animation code were not changed.
- CI's dependency installation was moved before unit verification because the new
  renderer unit tests import the already-declared Three.js development dependency.
  This workflow edit was not published or triggered.

## Reproduce / remaining work

```powershell
npm run build:renderer
npm run test:unit
$env:PLAYWRIGHT_CHANNEL='msedge'
npm run test:browser
npm run profile:garden
```

Use `PLAYWRIGHT_CHANNEL` for another installed Chromium-family channel. Raw counters,
timing pairs, screenshots, controls, and diff images are local in
`performance-artifacts/` (ignored by Git). The baseline renderer is pinned to
`aebdde7`; that commit must be available locally. `--capture-only` after the output
directory refreshes pictures without replacing the measurements JSON.

Before making an FPS promise, repeat rotation/edit/first-open tests on actual Android
Chrome and iPhone Safari, including GPU timing/frame pacing and thermal behavior.
Cold shader/environment setup is still present and is outside the warm-path numbers.
Keep the current artwork and quality settings unless profiling on those devices
justifies a separately agreed tradeoff. No WebGPU migration, LOD reduction, adaptive
resolution, particle addition, or unrelated gameplay rewrite was performed.
