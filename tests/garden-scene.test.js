import assert from "node:assert/strict";
import test from "node:test";
import { createFixedLevelPuzzle, createEmptyBoard } from "../src/engine.js";
import { buildGardenScene, gardenGLTF } from "../src/garden-scene.js";
import { QUEEN_MODEL } from '../src/queen-model.js';

test('Blender queen preserves detailed geometry, unit normals, and PBR materials', () => {
  assert.equal(QUEEN_MODEL.length, 3);
  assert.ok(QUEEN_MODEL.reduce((sum, mesh) => sum + mesh.positions.length / 3, 0) > 5000);
  for (const mesh of QUEEN_MODEL) {
    assert.equal(mesh.normals.length, mesh.positions.length);
    for (let i = 0; i < mesh.normals.length; i += 3)
      assert.ok(Math.abs(Math.hypot(...mesh.normals.slice(i, i + 3)) - 1) < 0.001);
  }
  const gltf = gardenGLTF({size: 1, meshes: QUEEN_MODEL});
  assert.ok(gltf.materials.some(m => m.pbrMetallicRoughness.metallicFactor > 0.8));
  assert.ok(gltf.meshes.every(m => Number.isInteger(m.primitives[0].attributes.NORMAL)));
});

test("3D export contains only visible pieces and preserves tile coordinates", () => {
  const puzzle = createFixedLevelPuzzle(7, 1);
  const board = createEmptyBoard(7);
  const empty = buildGardenScene(puzzle, board);
  assert.equal(empty.meshes.length, 50);
  assert.equal(
    empty.meshes.some((mesh) => mesh.name.startsWith("Queen")),
    false,
  );
  board[1][2] = 1;
  board[3][4] = 2;
  const scene = buildGardenScene(puzzle, board);
  assert.equal(scene.meshes.length, 54);
  assert.deepEqual(
    scene.meshes.find((mesh) => mesh.name === "Tile R2 C3").extras,
    { row: 2, column: 3, region: puzzle.regions[1][2] + 1 },
  );
  const gltf = gardenGLTF(scene);
  assert.equal(gltf.asset.version, "2.0");
  assert.equal(gltf.nodes.length, scene.meshes.length);
  const bytes = Buffer.from(gltf.buffers[0].uri.split(",")[1], "base64");
  assert.equal(bytes.length, gltf.buffers[0].byteLength);
  for (const view of gltf.bufferViews) {
    assert.equal(view.byteOffset % 4, 0);
    assert.ok(view.byteOffset + view.byteLength <= bytes.length);
  }
  const encoded = JSON.stringify(gltf);
  assert.equal(encoded.includes('"queens"'), false);
  assert.equal(encoded.includes("http"), false);
  for (const mesh of scene.meshes) {
    assert.ok(mesh.positions.every(Number.isFinite));
    assert.ok(
      mesh.indices.every((i) => i >= 0 && i < mesh.positions.length / 3),
    );
  }
});

test("maximum-size scene stays finite and keeps the player board unchanged", () => {
  const puzzle = createFixedLevelPuzzle(15, 1),
    board = createEmptyBoard(15);
  const before = JSON.stringify(board);
  const gltf = gardenGLTF(buildGardenScene(puzzle, board));
  assert.equal(gltf.nodes.length, 226);
  assert.equal(JSON.stringify(board), before);
  assert.throws(() => buildGardenScene(puzzle, [[99]]));
});
