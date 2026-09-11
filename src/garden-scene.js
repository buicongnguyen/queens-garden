// Shared geometry for the browser preview and Blender-compatible glTF export.
// Coordinates are glTF Y-up; rows increase along +Z, columns along +X.
import { QUEEN_MODEL } from './queen-model.js';
const COLORS = [
  "#e5adad",
  "#e8c394",
  "#e2dc98",
  "#b7d99c",
  "#91cdbb",
  "#9acddc",
  "#9db9e2",
  "#b4a5da",
  "#d5a5d6",
  "#d4b8a1",
  "#b8c39a",
  "#a0c1ba",
  "#b1b9d5",
  "#d2b2bf",
  "#c6c4b2",
];

function paletteHex(value, fallback) {
  const match = /^hsl\((\d+) (\d+)% (\d+)%\)$/.exec(value ?? "");
  if (!match) return fallback;
  const h = Number(match[1]) / 30,
    s = Number(match[2]) / 100,
    l = Number(match[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  return (
    "#" +
    [0, 8, 4]
      .map((n) => {
        const k = (n + h) % 12;
        const channel = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(channel * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

function box(name, x, y, z, width, height, depth, color, extras) {
  const w = width / 2,
    h = height / 2,
    d = depth / 2;
  const positions = [
    -w,
    -h,
    -d,
    w,
    -h,
    -d,
    w,
    h,
    -d,
    -w,
    h,
    -d,
    -w,
    -h,
    d,
    w,
    -h,
    d,
    w,
    h,
    d,
    -w,
    h,
    d,
  ];
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += x;
    positions[i + 1] += y;
    positions[i + 2] += z;
  }
  return {
    name,
    positions,
    indices: [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5, 3,
      7, 6, 3, 6, 2, 0, 1, 5, 0, 5, 4,
    ],
    color,
    extras,
  };
}

export function buildGardenScene(puzzle, board) {
  const n = puzzle.size;
  if (
    !Number.isInteger(n) ||
    n < 1 ||
    n > 15 ||
    board.length !== n ||
    board.some(
      (row) =>
        row.length !== n || row.some((value) => ![0, 1, 2].includes(value)),
    ) ||
    puzzle.regions.length !== n ||
    puzzle.regions.some(
      (row) =>
        row.length !== n ||
        row.some(
          (value) => !Number.isInteger(value) || value < 0 || value >= n,
        ),
    )
  ) {
    throw new Error("Invalid scene board.");
  }
  const meshes = [
    box("Garden plinth", 0, -0.23, 0, n + 0.3, 0.3, n + 0.3, "#334b42", {}),
  ];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const region = puzzle.regions[r][c];
      const x = c - (n - 1) / 2,
        z = r - (n - 1) / 2;
      const meta = { row: r + 1, column: c + 1, region: region + 1 };
      const color = paletteHex(puzzle.palette?.[region], COLORS[region]);
      meshes.push(
        box(`Tile R${r + 1} C${c + 1}`, x, 0, z, 0.94, 0.16, 0.94, color, meta),
      );
      if (board[r][c] === 1) {
        for (const template of QUEEN_MODEL) {
          const positions = template.positions.map((value, i) => value + [x, 0.08, z][i % 3]);
          meshes.push({ ...template, positions, name: `${template.name} R${r + 1} C${c + 1}`, extras: meta });
        }
        continue;
      } else if (board[r][c] === 2) {
        meshes.push(
          box(
            `Mark R${r + 1} C${c + 1}`,
            x,
            0.11,
            z,
            0.19,
            0.06,
            0.19,
            "#334b42",
            meta,
          ),
        );
      }
    }
  return { size: n, meshes };
}

export function gardenGLTF(scene) {
  const chunks = [],
    bufferViews = [],
    accessors = [],
    meshes = [],
    nodes = [],
    materials = [];
  const colorMap = new Map();
  let byteLength = 0;
  function addBuffer(data, target) {
    const padding = (4 - (byteLength % 4)) % 4;
    if (padding) {
      chunks.push(new Uint8Array(padding));
      byteLength += padding;
    }
    const index = bufferViews.length;
    chunks.push(new Uint8Array(data.buffer));
    bufferViews.push({
      buffer: 0,
      byteOffset: byteLength,
      byteLength: data.byteLength,
      target,
    });
    byteLength += data.byteLength;
    return index;
  }
  for (const mesh of scene.meshes) {
    const materialKey = `${mesh.color}/${mesh.metallic ?? 0}/${mesh.roughness ?? 0.36}`;
    if (!colorMap.has(materialKey)) {
      colorMap.set(materialKey, materials.length);
      const srgb = [1, 3, 5].map(
        (i) => parseInt(mesh.color.slice(i, i + 2), 16) / 255,
      );
      const linear = srgb.map((v) =>
        v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
      );
      materials.push({
        name: mesh.color,
        pbrMetallicRoughness: {
          baseColorFactor: [...linear, 1],
          metallicFactor: mesh.metallic ?? 0,
          roughnessFactor: mesh.roughness ?? 0.36,
        },
        doubleSided: false,
      });
    }
    const vertices = new Float32Array(mesh.positions);
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: addBuffer(vertices, 34962),
      componentType: 5126,
      count: vertices.length / 3,
      type: "VEC3",
      min: [0, 1, 2].map((axis) =>
        Math.min(...mesh.positions.filter((_, i) => i % 3 === axis)),
      ),
      max: [0, 1, 2].map((axis) =>
        Math.max(...mesh.positions.filter((_, i) => i % 3 === axis)),
      ),
    });
    const attributes = { POSITION: positionAccessor };
    if (mesh.normals) {
      attributes.NORMAL = accessors.length;
      accessors.push({ bufferView: addBuffer(new Float32Array(mesh.normals), 34962),
        componentType: 5126, count: mesh.normals.length / 3, type: 'VEC3' });
    }
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: addBuffer(new Uint16Array(mesh.indices), 34963),
      componentType: 5123,
      count: mesh.indices.length,
      type: "SCALAR",
    });
    meshes.push({
      name: mesh.name,
      primitives: [
        {
          attributes,
          indices: indexAccessor,
          material: colorMap.get(materialKey),
        },
      ],
    });
    nodes.push({
      name: mesh.name,
      mesh: meshes.length - 1,
      extras: mesh.extras,
    });
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return {
    asset: { version: "2.0", generator: "Queen's Garden" },
    scene: 0,
    scenes: [
      { name: "Current player position", nodes: nodes.map((_, i) => i) },
    ],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [
      {
        byteLength,
        uri: `data:application/octet-stream;base64,${btoa(binary)}`,
      },
    ],
  };
}
