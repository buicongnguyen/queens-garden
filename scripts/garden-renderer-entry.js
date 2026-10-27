import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { groupParts, makeBatch, updateBatch, disposeBatch } from './garden-batches.js';

const views = new WeakMap();
export function drawGarden(canvas, data, angle = 35) {
  let view = views.get(canvas);
  if (!view) {
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
    catch { return false; }
    renderer.setSize(720, 480, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    const scene = new THREE.Scene();
    scene.matrixAutoUpdate = false;
    scene.background = new THREE.Color('#182824');
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(environment, 0.04);
    scene.environment = target.texture;
    environment.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffefd8, 0x263b31, 0.7));
    const key = new THREE.DirectionalLight(0xfff1da, 2.5);
    key.position.set(-4, 10, 5); key.castShadow = true;
    key.updateMatrix(); key.matrixAutoUpdate = false;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00015; key.shadow.normalBias = 0.025;
    scene.add(key);
    const group = new THREE.Group(); scene.add(group);
    group.matrixAutoUpdate = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#21352e', roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.39; floor.receiveShadow = true;
    floor.updateMatrix(); floor.matrixAutoUpdate = false; group.add(floor);
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 150);
    view = { renderer, scene, camera, group, key, target, batches: new Map() }; views.set(canvas, view);
    canvas.addEventListener('webglcontextrestored', () => {
      const data=view.data, angle=view.angle;
      // Render-target contents are lost with the context; rebuild studio lighting too.
      view.target.dispose();
      const room=new RoomEnvironment(), generator=new THREE.PMREMGenerator(renderer);
      view.target=generator.fromScene(room,0.04);view.scene.environment=view.target.texture;
      room.dispose();generator.dispose();
      view.data=null;view.angle=null;
      if(data) drawGarden(canvas,data,angle);
    });
  }
  const changed = view.data !== data;
  if (!changed && view.angle === angle && !view.renderer.getContext().isContextLost()) return true;
  if (view.data !== data) {
    const groups=groupParts(data);
    for(const [key, parts] of groups) {
      let mesh=view.batches.get(key);
      if(!mesh) {mesh=makeBatch(parts);view.batches.set(key,mesh);view.group.add(mesh);}
      updateBatch(mesh,parts);
    }
    for(const [key,mesh] of view.batches) if(!groups.has(key)) {
      disposeBatch(mesh);view.batches.delete(key);
    }
    const extent = data.size + 2;
    Object.assign(view.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: 50 });
    view.key.shadow.camera.updateProjectionMatrix();
    view.renderer.shadowMap.needsUpdate = true;
    view.data = data;
  }
  const yaw = angle * Math.PI / 180, distance = Math.max(3.4, data.size * 1.75);
  view.camera.position.set(Math.sin(yaw) * distance, distance * 0.9, Math.cos(yaw) * distance);
  view.camera.lookAt(0, 0.25, 0);
  view.renderer.render(view.scene, view.camera);
  view.angle = angle;
  return true;
}
