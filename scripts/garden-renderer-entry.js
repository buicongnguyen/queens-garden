import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#182824');
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const target = pmrem.fromScene(environment, 0.04);
    scene.environment = target.texture;
    environment.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffefd8, 0x263b31, 0.7));
    const key = new THREE.DirectionalLight(0xfff1da, 2.5);
    key.position.set(-4, 10, 5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.00015; key.shadow.normalBias = 0.025;
    scene.add(key);
    const group = new THREE.Group(); scene.add(group);
    const camera = new THREE.PerspectiveCamera(36, 1.5, 0.1, 150);
    view = { renderer, scene, camera, group, key, target }; views.set(canvas, view);
  }
  if (view.data !== data) {
    for (const mesh of [...view.group.children]) {
      mesh.geometry.dispose(); mesh.material.dispose(); view.group.remove(mesh);
    }
    for (const part of data.meshes) {
      let geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(part.positions, 3));
      geometry.setIndex(part.indices);
      if (part.normals) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(part.normals, 3));
      else {
        geometry.computeBoundingBox();
        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        const center = geometry.boundingBox.getCenter(new THREE.Vector3());
        geometry.dispose();
        geometry = new RoundedBoxGeometry(size.x, size.y, size.z, 2, Math.min(size.y / 5, 0.035));
        geometry.translate(center.x, center.y, center.z);
      }
      const material = new THREE.MeshPhysicalMaterial({ color: part.color,
        metalness: part.metallic ?? 0,
        roughness: part.roughness ?? 0.36, clearcoat: 0.3, clearcoatRoughness: 0.2 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true; mesh.receiveShadow = true; view.group.add(mesh);
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: '#21352e', roughness: 0.7 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.39; floor.receiveShadow = true;
    view.group.add(floor);
    const extent = data.size + 2;
    Object.assign(view.key.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, far: 50 });
    view.key.shadow.camera.updateProjectionMatrix();
    view.data = data;
  }
  const yaw = angle * Math.PI / 180, distance = Math.max(3.4, data.size * 1.75);
  view.camera.position.set(Math.sin(yaw) * distance, distance * 0.9, Math.cos(yaw) * distance);
  view.camera.lookAt(0, 0.25, 0);
  view.renderer.render(view.scene, view.camera);
  return true;
}
