/**
 * Segmentation Web Worker — v2
 * HU thresholding → mask blur → face extraction → Laplacian smoothing
 */

export type ScanType = 'abdomen' | 'brain' | 'chest';

export interface SegmentationInput {
  data: Float32Array;
  nx: number;
  ny: number;
  nz: number;
  scanType?: ScanType;
}

// ─── HU thresholds per scan type ─────────────────────────────
// Each tuple is [lo, hi] in Hounsfield Units.
const HU_RANGES: Record<ScanType, { vessels: [number,number]; tumor: [number,number]; bone: [number,number] }> = {
  abdomen: { vessels: [150, 400],  tumor: [20,  80],  bone: [400, 4000] },
  brain:   { vessels: [50,  100],  tumor: [25,  55],  bone: [700, 3000] },
  chest:   { vessels: [100, 350],  tumor: [-100, 80], bone: [400, 1800] },
};

export interface MeshResult {
  vertices: Float32Array;
  indices: Uint32Array;
}

export interface SegmentationResult {
  vessels: MeshResult;
  tumor: MeshResult;
  bone: MeshResult;
}

// ─── Downsample 2x ───────────────────────────────────────────
function downsample(src: Float32Array, nx: number, ny: number, nz: number) {
  const ox = Math.floor(nx / 2), oy = Math.floor(ny / 2), oz = Math.floor(nz / 2);
  const out = new Float32Array(ox * oy * oz);
  for (let z = 0; z < oz; z++)
    for (let y = 0; y < oy; y++)
      for (let x = 0; x < ox; x++)
        out[z * oy * ox + y * ox + x] = src[z * 2 * ny * nx + y * 2 * nx + x * 2];
  return { data: out, nx: ox, ny: oy, nz: oz };
}

// ─── Build binary mask from HU range ─────────────────────────
function buildMask(
  data: Float32Array, nx: number, ny: number, nz: number,
  lo: number, hi: number
): Float32Array {
  const mask = new Float32Array(nx * ny * nz);
  for (let i = 0; i < data.length; i++)
    mask[i] = (data[i] >= lo && data[i] <= hi) ? 1 : 0;
  return mask;
}

// ─── 3D box blur (radius 1) — softens hard voxel boundaries ─
function blur(mask: Float32Array, nx: number, ny: number, nz: number): Float32Array {
  const out = new Float32Array(nx * ny * nz);
  const get = (x: number, y: number, z: number) =>
    (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz)
      ? 0 : mask[z * ny * nx + y * nx + x];
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        let s = 0, n = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) { s += get(x+dx,y+dy,z+dz); n++; }
        out[z * ny * nx + y * nx + x] = s / n;
      }
  return out;
}

function extractSurface(
  field: Float32Array, nx: number, ny: number, nz: number, iso = 0.3
): MeshResult {
  const get = (x: number, y: number, z: number) => field[z * ny * nx + y * nx + x];
  
  const cellVerts = new Int32Array(nx * ny * nz).fill(-1);
  const verts: number[] = [];
  const inds: number[] = [];

  // 1. Generate one vertex per intersecting cell
  for (let z = 0; z < nz - 1; z++) {
    for (let y = 0; y < ny - 1; y++) {
      for (let x = 0; x < nx - 1; x++) {
        const v000 = get(x,y,z),   v100 = get(x+1,y,z),
              v010 = get(x,y+1,z), v110 = get(x+1,y+1,z),
              v001 = get(x,y,z+1), v101 = get(x+1,y,z+1),
              v011 = get(x,y+1,z+1), v111 = get(x+1,y+1,z+1);

        let cellMask = 0;
        if (v000 >= iso) cellMask |= 1;
        if (v100 >= iso) cellMask |= 2;
        if (v010 >= iso) cellMask |= 4;
        if (v110 >= iso) cellMask |= 8;
        if (v001 >= iso) cellMask |= 16;
        if (v101 >= iso) cellMask |= 32;
        if (v011 >= iso) cellMask |= 64;
        if (v111 >= iso) cellMask |= 128;

        if (cellMask === 0 || cellMask === 255) continue;

        let vx = 0, vy = 0, vz = 0, count = 0;
        const addEdge = (valA: number, valB: number, px: number, py: number, pz: number, axis: number) => {
          if ((valA >= iso) !== (valB >= iso)) {
             const t = (iso - valA) / (valB - valA + 1e-10);
             vx += px + (axis === 0 ? t : 0);
             vy += py + (axis === 1 ? t : 0);
             vz += pz + (axis === 2 ? t : 0);
             count++;
          }
        };
        addEdge(v000, v100, x, y, z, 0); addEdge(v010, v110, x, y+1, z, 0);
        addEdge(v001, v101, x, y, z+1, 0); addEdge(v011, v111, x, y+1, z+1, 0);
        addEdge(v000, v010, x, y, z, 1); addEdge(v100, v110, x+1, y, z, 1);
        addEdge(v001, v011, x, y, z+1, 1); addEdge(v101, v111, x+1, y, z+1, 1);
        addEdge(v000, v001, x, y, z, 2); addEdge(v100, v101, x+1, y, z, 2);
        addEdge(v010, v011, x, y+1, z, 2); addEdge(v110, v111, x+1, y+1, z, 2);

        const vIdx = verts.length / 3;
        verts.push(vx/count, vy/count, vz/count);
        cellVerts[z * ny * nx + y * nx + x] = vIdx;
      }
    }
  }

  // 2. Generate quads for every intersecting interior edge
  for (let z = 1; z < nz - 1; z++) {
    for (let y = 1; y < ny - 1; y++) {
      for (let x = 1; x < nx - 1; x++) {
        const v = get(x,y,z);
        const inside = v >= iso;

        // X-edge
        if (inside !== (get(x+1,y,z) >= iso)) {
          const c00 = cellVerts[(z-1)*ny*nx + (y-1)*nx + x];
          const c01 = cellVerts[(z-1)*ny*nx + y*nx + x];
          const c10 = cellVerts[z*ny*nx + (y-1)*nx + x];
          const c11 = cellVerts[z*ny*nx + y*nx + x];
          if (c00 !== -1 && c01 !== -1 && c10 !== -1 && c11 !== -1) {
            if (inside) inds.push(c00, c10, c11, c00, c11, c01);
            else        inds.push(c00, c01, c11, c00, c11, c10);
          }
        }

        // Y-edge
        if (inside !== (get(x,y+1,z) >= iso)) {
          const c00 = cellVerts[(z-1)*ny*nx + y*nx + (x-1)];
          const c01 = cellVerts[(z-1)*ny*nx + y*nx + x];
          const c10 = cellVerts[z*ny*nx + y*nx + (x-1)];
          const c11 = cellVerts[z*ny*nx + y*nx + x];
          if (c00 !== -1 && c01 !== -1 && c10 !== -1 && c11 !== -1) {
            if (inside) inds.push(c00, c01, c11, c00, c11, c10);
            else        inds.push(c00, c10, c11, c00, c11, c01);
          }
        }

        // Z-edge
        if (inside !== (get(x,y,z+1) >= iso)) {
          const c00 = cellVerts[z*ny*nx + (y-1)*nx + (x-1)];
          const c01 = cellVerts[z*ny*nx + (y-1)*nx + x];
          const c10 = cellVerts[z*ny*nx + y*nx + (x-1)];
          const c11 = cellVerts[z*ny*nx + y*nx + x];
          if (c00 !== -1 && c01 !== -1 && c10 !== -1 && c11 !== -1) {
            if (inside) inds.push(c00, c10, c11, c00, c11, c01);
            else        inds.push(c00, c01, c11, c00, c11, c10);
          }
        }
      }
    }
  }

  return { vertices: new Float32Array(verts), indices: new Uint32Array(inds) };
}

// ─── Laplacian smoothing ──────────────────────────────────────
function smooth(mesh: MeshResult, iterations = 6): MeshResult {
  if (mesh.vertices.length === 0) return mesh;

  const verts = new Float32Array(mesh.vertices);
  const inds = mesh.indices;
  const N = verts.length / 3;

  // Build adjacency
  const adj: Set<number>[] = Array.from({ length: N }, () => new Set<number>());
  for (let i = 0; i < inds.length; i += 3) {
    const [a, b, c] = [inds[i], inds[i+1], inds[i+2]];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }

  const tmp = new Float32Array(verts.length);
  for (let iter = 0; iter < iterations; iter++) {
    for (let v = 0; v < N; v++) {
      const neighbors = adj[v];
      if (neighbors.size === 0) {
        tmp[v*3]   = verts[v*3];
        tmp[v*3+1] = verts[v*3+1];
        tmp[v*3+2] = verts[v*3+2];
        continue;
      }
      let sx = 0, sy = 0, sz = 0;
      for (const n of neighbors) {
        sx += verts[n*3]; sy += verts[n*3+1]; sz += verts[n*3+2];
      }
      const cnt = neighbors.size;
      // Taubin λ/μ smoothing to prevent shrinkage
      const λ = iter % 2 === 0 ? 0.5 : -0.52;
      tmp[v*3]   = verts[v*3]   + λ * (sx/cnt - verts[v*3]);
      tmp[v*3+1] = verts[v*3+1] + λ * (sy/cnt - verts[v*3+1]);
      tmp[v*3+2] = verts[v*3+2] + λ * (sz/cnt - verts[v*3+2]);
    }
    verts.set(tmp);
  }

  return { vertices: verts, indices: inds };
}

// ─── Main worker handler ──────────────────────────────────────
self.onmessage = (e: MessageEvent<SegmentationInput>) => {
  try {
    const { data, nx, ny, nz, scanType = 'abdomen' } = e.data;
    const hu = HU_RANGES[scanType];

    self.postMessage({ type: 'progress', value: 10, label: 'Downsampling volume…' });
    const ds = downsample(data, nx, ny, nz);

    self.postMessage({ type: 'progress', value: 22, label: 'Extracting vessels…' });
    const vesselMask = buildMask(ds.data, ds.nx, ds.ny, ds.nz, hu.vessels[0], hu.vessels[1]);
    const vesselBlur = blur(vesselMask, ds.nx, ds.ny, ds.nz);
    const vessels = smooth(extractSurface(vesselBlur, ds.nx, ds.ny, ds.nz, 0.25), 8);

    self.postMessage({ type: 'progress', value: 46, label: 'Extracting tumor…' });
    const tumorMask = buildMask(ds.data, ds.nx, ds.ny, ds.nz, hu.tumor[0], hu.tumor[1]);
    const tumorBlur = blur(tumorMask, ds.nx, ds.ny, ds.nz);
    const tumor = smooth(extractSurface(tumorBlur, ds.nx, ds.ny, ds.nz, 0.25), 8);

    self.postMessage({ type: 'progress', value: 70, label: 'Extracting bone…' });
    const boneMask = buildMask(ds.data, ds.nx, ds.ny, ds.nz, hu.bone[0], hu.bone[1]);
    const boneBlur = blur(boneMask, ds.nx, ds.ny, ds.nz);
    const bone = smooth(extractSurface(boneBlur, ds.nx, ds.ny, ds.nz, 0.25), 4);

    self.postMessage({ type: 'progress', value: 95, label: 'Building scene…' });

    const result: SegmentationResult = { vessels, tumor, bone };
    self.postMessage(
      { type: 'done', result },
      {
        transfer: [
          vessels.vertices.buffer, vessels.indices.buffer,
          tumor.vertices.buffer,   tumor.indices.buffer,
          bone.vertices.buffer,    bone.indices.buffer,
        ],
      }
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
