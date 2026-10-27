import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Only translation is needed: the puzzle's pieces have no per-piece animation.
// Keep color/finish separate so batching never changes the artwork's PBR materials.
export function groupParts(data) {
  const groups = new Map();
  for (const part of data.meshes) {
    const shapeKey = part.shape ? `box:${part.shape.join(',')}` : part.geometryKey;
    const key = JSON.stringify([shapeKey, part.color, part.metallic ?? 0, part.roughness ?? 0.36]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }
  return groups;
}

export function makeBatch(parts) {
  const part = parts[0];
  let geometry;
  if (part.shape) {
    const [w,h,d] = part.shape;
    geometry = new RoundedBoxGeometry(w,h,d,2,Math.min(h/5,0.035));
  } else {
    geometry = new THREE.BufferGeometry();
    // Accept both compact preview data and existing world-space export data.
    const positions = part.local ? part.positions : part.positions.map((v,i)=>v-part.translation[i%3]);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals,3));
    geometry.setIndex(part.indices);
  }
  const material = new THREE.MeshPhysicalMaterial({color:part.color,metalness:part.metallic??0,
    roughness:part.roughness??0.36,clearcoat:0.3,clearcoatRoughness:0.2});
  // Maximum legal board has 225 slots. Fixed capacity avoids GPU reallocation on moves.
  const mesh = new THREE.InstancedMesh(geometry,material,225);
  mesh.count=0; mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // r186 clears ranges after bufferSubData, but not after the first bufferData.
  // Both transfers satisfy every pending range; retain ranges until that callback.
  mesh.instanceMatrix.onUpload(() => mesh.instanceMatrix.clearUpdateRanges());
  mesh.matrixAutoUpdate=false;
  return mesh;
}

export function updateBatch(mesh, parts) {
  const attribute=mesh.instanceMatrix, array=attribute.array;
  let first=Infinity,last=-1;
  for(let slot=0;slot<parts.length;slot++) {
    const offset=slot*16, t=parts[slot].translation;
    for(let i=0;i<16;i++) {
      const value=Math.fround(i===12?t[0]:i===13?t[1]:i===14?t[2]:i%5===0?1:0);
      if(array[offset+i]!==value) {array[offset+i]=value;first=Math.min(first,offset+i);last=Math.max(last,offset+i);}
    }
  }
  const countChanged=mesh.count!==parts.length;
  mesh.count=parts.length;
  if(last>=0) {
    // Preserve pending changes if a batch was culled before its upload happened.
    for(const range of attribute.updateRanges) {first=Math.min(first,range.start);last=Math.max(last,range.start+range.count-1);}
    attribute.clearUpdateRanges();attribute.addUpdateRange(first,last-first+1);attribute.needsUpdate=true;
  }
  if(last>=0||countChanged) mesh.computeBoundingSphere();
  return last>=0||countChanged;
}

export function disposeBatch(mesh) {
  mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();
}
