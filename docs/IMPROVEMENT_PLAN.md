# Queen's Garden improvement plan — 2026-09-11

## Evaluation

The existing engine validates 180 unique puzzles and all four rules. Keep it as
the single authority for both presentation modes. The main friction is recovering
from mistakes, finding a reason to return, and understanding the board without
depending on colors. Best-time fairness also needs attention: a hinted solution
currently enters the same record list as an unaided one.

## Implementation scope and order

1. **Fair play and recovery.** Add bounded undo/redo snapshots, clear them when a
   puzzle changes, and group a drag into one history transaction. Canceled touch
   marks must leave neither board changes nor history entries. Keep the elapsed
   clock running through undo. Freeze history on completion/reveal. Flag hint use
   for the whole attempt and exclude assisted completions from best-time records.
   Existing records remain legacy records; their assistance history is unknown.
2. **Return and progression.** Add a daily 7×7 board chosen by UTC calendar date
   from the validated database, with its date visible throughout that attempt.
   Daily attempts do not enter random-size records. Add Next level for completed
   fixed boards, disabled at the end of the 20-level set. Do not claim generated
   novelty: daily layouts repeat after the saved set cycles.
3. **Readable controls.** Put Undo, Redo, Daily, and a region-number toggle near
   the board. Add a visible completion message and next-level action. Numbers
   repeat in every region cell; screen-reader cell labels remain authoritative.
4. **3D and Blender.** Add an optional rotatable, elevated garden scene in the
   menu using deterministic mesh geometry and a lightweight canvas projection.
   It is a view of the current board, not a second editable game or a 3D ruleset.
   Export exactly those meshes as embedded-buffer glTF 2.0 with named cells,
   materials, and row/column/region metadata. Export only player-visible pieces,
   never the hidden answer. Blender can import and edit the resulting scene.
   Keep 2D interaction available on devices without canvas support.
5. **Review and release.** Add behavior tests for daily dates, history branching,
   assistance eligibility, and glTF geometry/schema invariants. Run the full
   puzzle suite and reproducibility check. Exercise the integrated UI, inspect
   the final diff, fix regressions, then commit and push via the existing SSH
   origin. Wait for Pages verification/deployment and check production assets.

## Logic review before implementation

- A renderer must never decide whether a board is solved: read engine analysis.
- Hint/3D/reveal must not accidentally create an unaided record. A 3D preview
  contains only the current position; hints permanently flag the current attempt.
- Undo snapshots own their matrices. A new edit invalidates redo. Drag history
  commits at gesture end; cancellation restores the original position.
- Daily date is captured when the board starts, so midnight cannot rename an
  active attempt. UTC is explicit and identical across time zones.
- Export uses Y-up coordinates with row zero at negative Z and column zero at
  negative X. No hidden solution, executable script, or external URL is exported.
- 3D rotation and export must not mutate the puzzle, timer, history, or scores.
- Large scenes are generated/drawn only when requested. No continuous animation
  loop, CDN runtime dependency, or permanent WebGL requirement is introduced.

## Blender workflow and later options

Download the current scene from Game → 3D garden, then in Blender choose
File → Import → glTF 2.0. The mesh names and custom extras identify each tile and
piece. Save a `.blend` file to add bevels, lights, materials, or original models.
Blender's glTF importer/exporter is documented at
https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html.

Further work should be measured separately: a curated difficulty progression,
an introductory 5×5 tutorial set (requires new validated content), resumable
sessions, and optional Blender-authored GLB queen models. Full 3D rule variants
would require new rules, a new solver, and new uniqueness tests; they are not a
cosmetic switch for this game.

## Acceptance evidence

- Implemented all five scoped steps. The browser runtime remains dependency-free;
  Playwright and the Khronos glTF validator are development dependencies only.
- 23 unit tests pass, including UTC date selection, bounded history, branching,
  record eligibility, visible-only scene export, and maximum-size geometry.
- Nine Edge integration tests cover: ordinary and drag undo, redo invalidation,
  multi-touch rollback, assisted/unassisted scoring, last-level boundary, daily
  selection, region labels, mobile overflow, modal focus, scene download, and
  rejection of private/traversal paths by the development server.
- The real downloaded scene passes the Khronos glTF validator with zero errors.
  Blender is not installed in the available standard installation path or PATH;
  direct import into the Blender application has not been exercised here.
- Review fixes: renderer base occlusion and triangle seams; missing modal focus
  targets for the new controls; misleading “all levels complete” text when only
  the last board was solved; timer starting before initial rendering; and the
  Windows Python alias preventing the local server from starting.
- The development server now uses Node, binds only to loopback, and serves only
  public game assets. GitHub Pages still hosts static files with relative URLs.
- Full `npm run verify` passed: all 180 saved levels, the procedural fixtures,
  and deterministic regeneration of the complete database.
