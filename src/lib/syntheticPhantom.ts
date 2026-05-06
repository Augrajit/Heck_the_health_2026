/**
 * Synthetic Phantom Generator v2
 * Higher resolution (96³), more anatomically shaped structures.
 */

export interface PhantomVolume {
  data: Float32Array;
  nx: number; ny: number; nz: number;
  pixelSpacing: number;
  sliceThickness: number;
  modality: string;
  studyDescription: string;
}

export function generateSyntheticPhantom(): PhantomVolume {
  const nx = 96, ny = 96, nz = 96;
  const data = new Float32Array(nx * ny * nz).fill(-1000);
  const cx = nx / 2, cy = ny / 2, cz = nz / 2;

  const set = (x: number, y: number, z: number, hu: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return;
    // Only overwrite if higher priority (higher HU wins except air)
    const i = Math.round(z) * ny * nx + Math.round(y) * nx + Math.round(x);
    if (data[i] === -1000 || hu > data[i]) data[i] = hu;
  };

  // ── Bone ring (pelvis-like elliptical ring) ────────────────
  for (let z = 14; z < 82; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const dx = (x - cx) / 30, dy = (y - cy) / 24;
        const r2 = dx * dx + dy * dy;
        if (r2 > 0.85 && r2 < 1.15) data[z * ny * nx + y * nx + x] = 650;
      }
    }
  }

  // ── Aorta — central vertical oval tube ────────────────────
  for (let z = 8; z < 88; z++) {
    const warp = Math.sin(z * 0.15) * 1.5; // slight curvature
    for (let dy = -7; dy <= 7; dy++)
      for (let dx = -5; dx <= 5; dx++) {
        if ((dx/5)*(dx/5) + (dy/7)*(dy/7) < 1.0)
          set(cx + dx + warp, cy - 4 + dy, z, 260);
      }
  }

  // ── Iliac bifurcation — two branch vessels ─────────────────
  for (let t = 0; t <= 24; t++) {
    const angle = (t / 24) * (Math.PI / 3);
    // Left branch
    const lx = cx - 4 - t * Math.sin(angle) * 0.8;
    const ly = cy - 4 + t * 0.3;
    const lz = 12 + t * 1.2;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx*dx+dy*dy < 16) set(lx+dx, ly+dy, lz, 240);

    // Right branch
    const rx = cx + 4 + t * Math.sin(angle) * 0.8;
    const ry = cy - 4 + t * 0.3;
    const rz = 12 + t * 1.2;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx*dx+dy*dy < 16) set(rx+dx, ry+dy, rz, 240);
  }

  // ── Renal arteries — horizontal branches ──────────────────
  for (let x = 14; x < cx - 5; x++) {
    const t = (x - 14) / (cx - 19);
    const ly = cy - 4 + Math.sin(t * Math.PI) * 2;
    const lz = cz + 18;
    for (let dy = -3; dy <= 3; dy++)
      for (let dz = -3; dz <= 3; dz++)
        if (dy*dy+dz*dz < 10) set(x, ly+dy, lz+dz, 230);
  }
  for (let x = cx + 5; x < nx - 14; x++) {
    const t = (x - cx - 5) / (nx - 19 - cx - 5);
    const ry = cy - 4 + Math.sin(t * Math.PI) * 2;
    const rz = cz + 18;
    for (let dy = -3; dy <= 3; dy++)
      for (let dz = -3; dz <= 3; dz++)
        if (dy*dy+dz*dz < 10) set(x, ry+dy, rz+dz, 230);
  }

  // ── Tumor — irregular blob near right renal artery ────────
  const [tx, ty, tz] = [cx + 16, cy + 6, cz + 16];
  for (let z = tz - 9; z <= tz + 9; z++)
    for (let y = ty - 8; y <= ty + 8; y++)
      for (let x = tx - 10; x <= tx + 10; x++) {
        const dx = (x-tx)/10, dy = (y-ty)/8, dz = (z-tz)/9;
        // Add noise for irregular shape
        const noise = Math.sin(x*0.8)*0.15 + Math.cos(y*0.9)*0.12 + Math.sin(z*0.7)*0.1;
        if (dx*dx + dy*dy + dz*dz < 0.85 + noise)
          set(x, y, z, 55);
      }

  // ── Secondary nodule ──────────────────────────────────────
  const [sx2, sy2, sz2] = [cx - 14, cy + 10, cz + 22];
  for (let z = sz2-5; z <= sz2+5; z++)
    for (let y = sy2-5; y <= sy2+5; y++)
      for (let x = sx2-5; x <= sx2+5; x++) {
        const dx = x-sx2, dy = y-sy2, dz = z-sz2;
        if (dx*dx+dy*dy+dz*dz < 25) set(x, y, z, 45);
      }

  return {
    data, nx, ny, nz,
    pixelSpacing: 1.0,
    sliceThickness: 1.0,
    modality: 'CT',
    studyDescription: 'Abdominal CT Phantom — Aorta with Tumor',
  };
}

export function phantomSliceToImageData(
  phantom: PhantomVolume,
  sliceIndex: number,
  windowCenter = 60,
  windowWidth = 900
): ImageData {
  const { data, nx, ny } = phantom;
  const imageData = new ImageData(nx, ny);
  const lower = windowCenter - windowWidth / 2;
  const upper = windowCenter + windowWidth / 2;

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const hu = data[sliceIndex * ny * nx + y * nx + x];
      let v = ((hu - lower) / (upper - lower)) * 255;
      v = Math.max(0, Math.min(255, v));
      const px = (y * nx + x) * 4;
      imageData.data[px] = v;
      imageData.data[px+1] = v;
      imageData.data[px+2] = v;
      imageData.data[px+3] = 255;
    }
  }
  return imageData;
}
