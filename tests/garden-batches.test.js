import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Group } from 'three';
import { groupParts, makeBatch, updateBatch, disposeBatch } from '../scripts/garden-batches.js';
import { buildGardenScene, gardenGLTF } from '../src/garden-scene.js';
import { createFixedLevelPuzzle, createEmptyBoard } from '../src/engine.js';

const puzzle=createFixedLevelPuzzle(7,1);
function scene() {const b=createEmptyBoard(7);b[0][0]=1;b[2][2]=1;return buildGardenScene(puzzle,b,{compact:true});}
test('compact scene shares queen arrays and exports identical world geometry',()=>{
  const b=createEmptyBoard(7);b[0][0]=1;b[2][2]=1;
  const compact=buildGardenScene(puzzle,b,{compact:true});
  const queens=compact.meshes.filter(p=>p.geometryKey==='Queen base porcelain');
  assert.equal(queens[0].positions,queens[1].positions);
  assert.deepEqual(gardenGLTF(compact),gardenGLTF(buildGardenScene(puzzle,b)));
});
test('stable batches do not dirty uploads; pending ranges survive move, shrink, and regrowth',()=>{
  const parts=[...groupParts(scene()).values()].find(p=>p[0].geometryKey);
  const mesh=makeBatch(parts);updateBatch(mesh,parts);
  const version=mesh.instanceMatrix.version;
  const ranges=structuredClone(mesh.instanceMatrix.updateRanges);
  assert.equal(updateBatch(mesh,parts),false);
  assert.equal(mesh.instanceMatrix.version,version);
  assert.deepEqual(mesh.instanceMatrix.updateRanges,ranges);
  const moved=parts.map(p=>({...p,translation:[...p.translation]}));
  moved[1].translation[0]=3.123456789;
  updateBatch(mesh,moved);
  assert.equal(updateBatch(mesh,moved),false,'compare at Float32 precision');
  assert.equal(mesh.instanceMatrix.updateRanges.length,1);
  const pending=mesh.instanceMatrix.updateRanges[0];
  assert.ok(pending.start<=ranges[0].start);
  assert.ok(pending.start+pending.count>=ranges[0].start+ranges[0].count);
  updateBatch(mesh,[moved[1]]);assert.equal(mesh.count,1);
  let matrix=new Matrix4();mesh.getMatrixAt(0,matrix);assert.equal(matrix.elements[12],Math.fround(3.123456789));
  updateBatch(mesh,[]);assert.equal(mesh.count,0);
  updateBatch(mesh,parts);assert.equal(mesh.count,2);
  assert.ok(Number.isFinite(mesh.boundingSphere.radius));
  mesh.instanceMatrix.onUploadCallback();
  assert.equal(mesh.instanceMatrix.updateRanges.length,0,'completed initial/subrange upload clears pending metadata');
  disposeBatch(mesh);
});
test('static batch matrices retain parent transform propagation and explicit updates',()=>{
  const parts=[...groupParts(scene()).values()][0],mesh=makeBatch(parts),parent=new Group();
  parent.add(mesh);updateBatch(mesh,parts);parent.updateMatrixWorld(true);
  parent.position.set(2,3,4);parent.rotation.y=.5;parent.scale.setScalar(2);parent.updateMatrixWorld();
  assert.deepEqual(mesh.matrixWorld.elements,parent.matrixWorld.elements);
  mesh.position.x=2;mesh.updateMatrix();mesh.updateWorldMatrix(true,false);
  assert.deepEqual(mesh.matrixWorld.elements,new Matrix4().multiplyMatrices(parent.matrixWorld,mesh.matrix).elements);
  const other=new Group();other.position.y=7;other.add(mesh);other.updateMatrixWorld(true);
  assert.deepEqual(mesh.matrixWorld.elements,new Matrix4().multiplyMatrices(other.matrixWorld,mesh.matrix).elements);
  disposeBatch(mesh);
});
test('15x15 batching has bounded geometry and preserves every piece and finish',()=>{
  const p=createFixedLevelPuzzle(15,1),b=Array.from({length:15},()=>Array(15).fill(1));
  const data=buildGardenScene(p,b,{compact:true}),groups=groupParts(data);
  assert.ok(groups.size<=19);
  assert.equal([...groups.values()].reduce((n,list)=>n+list.length,0),901);
  for(const parts of groups.values()) {
    const mesh=makeBatch(parts);updateBatch(mesh,parts);
    assert.equal(mesh.count,parts.length);assert.ok(mesh.count<=225);
    assert.equal(mesh.material.roughness,parts[0].roughness??.36);
    disposeBatch(mesh);
  }
});
