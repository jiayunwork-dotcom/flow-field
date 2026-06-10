import type { VectorFieldData } from '../store/types';

export function parseCSV(text: string): VectorFieldData {
  const lines = text.trim().split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const points: Array<{ x: number; y: number; vx: number; vy: number }> = [];

  for (const line of lines) {
    const parts = line.split(/[,\s\t]+/).map(Number);
    if (parts.length < 4 || parts.some(isNaN)) continue;
    const [x, y, vx, vy] = parts;
    points.push({ x, y, vx, vy });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  if (points.length === 0) throw new Error('No valid data points found in CSV');

  const uniqueX = [...new Set(points.map((p) => p.x))].sort((a, b) => a - b);
  const uniqueY = [...new Set(points.map((p) => p.y))].sort((a, b) => a - b);

  let gridW = uniqueX.length;
  let gridH = uniqueY.length;

  if (gridW * gridH !== points.length) {
    const spacing = Math.max(
      uniqueX.length > 1 ? uniqueX[1] - uniqueX[0] : 1,
      uniqueY.length > 1 ? uniqueY[1] - uniqueY[0] : 1
    );
    gridW = Math.ceil((maxX - minX) / spacing) + 1;
    gridH = Math.ceil((maxY - minY) / spacing) + 1;
  }

  const MAX_POINTS = 1_000_000;
  let scaleDown = 1;
  if (gridW * gridH > MAX_POINTS) {
    scaleDown = Math.ceil(Math.sqrt((gridW * gridH) / MAX_POINTS));
    gridW = Math.ceil(gridW / scaleDown);
    gridH = Math.ceil(gridH / scaleDown);
  }

  const lookup = new Map<string, { vx: number; vy: number }>();
  for (const p of points) {
    lookup.set(`${p.x.toFixed(6)},${p.y.toFixed(6)}`, { vx: p.vx, vy: p.vy });
  }

  const data = new Float32Array(gridW * gridH * 2);
  const dx = uniqueX.length > 1 ? uniqueX[1] - uniqueX[0] : 1;
  const dy = uniqueY.length > 1 ? uniqueY[1] - uniqueY[0] : 1;

  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      const sx = gx * scaleDown;
      const sy = gy * scaleDown;
      const xVal = uniqueX.length > sx ? uniqueX[sx] : minX + sx * dx;
      const yVal = uniqueY.length > sy ? uniqueY[sy] : minY + sy * dy;
      const key = `${xVal.toFixed(6)},${yVal.toFixed(6)}`;
      const entry = lookup.get(key);
      const idx = (gy * gridW + gx) * 2;
      if (entry) {
        data[idx] = entry.vx;
        data[idx + 1] = entry.vy;
      }
    }
  }

  return { width: gridW, height: gridH, data };
}

export function parseVTK(text: string): VectorFieldData {
  const lines = text.split('\n');

  let lineIdx = 0;
  while (lineIdx < lines.length && !lines[lineIdx].includes('DATASET')) {
    lineIdx++;
  }

  if (lineIdx >= lines.length) throw new Error('Invalid VTK: no DATASET line found');

  const datasetLine = lines[lineIdx].trim();
  if (!datasetLine.includes('STRUCTURED_POINTS')) {
    throw new Error('Only ASCII VTK STRUCTURED_POINTS format is supported. Found: ' + datasetLine.split(' ')[1]);
  }

  lineIdx++;
  let dimensions: [number, number, number] = [1, 1, 1];

  while (lineIdx < lines.length) {
    const line = lines[lineIdx].trim();
    if (line.startsWith('DIMENSIONS')) {
      const parts = line.split(/\s+/);
      dimensions = [parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3])];
    } else if (line.startsWith('SPACING')) {
      // spacing parsed and discarded
    } else if (line.startsWith('ORIGIN')) {
      // origin parsed and discarded
    } else if (line.includes('POINT_DATA')) {
      break;
    }
    lineIdx++;
  }

  while (lineIdx < lines.length && !lines[lineIdx].includes('LOOKUP_TABLE')) {
    lineIdx++;
  }
  lineIdx++;

  const gridW = dimensions[0];
  const gridH = dimensions[1];
  const totalPoints = gridW * gridH * dimensions[2];

  const values: number[] = [];

  while (lineIdx < lines.length && values.length < totalPoints * 3) {
    const nums = lines[lineIdx].trim().split(/\s+/).map(Number).filter((n) => !isNaN(n));
    values.push(...nums);
    lineIdx++;
  }

  if (values.length < totalPoints * 3) {
    throw new Error(`VTK: expected ${totalPoints * 3} values, got ${values.length}`);
  }

  const MAX_POINTS = 1_000_000;
  let scaleDown = 1;
  if (gridW * gridH > MAX_POINTS) {
    scaleDown = Math.ceil(Math.sqrt((gridW * gridH) / MAX_POINTS));
  }

  const outW = Math.ceil(gridW / scaleDown);
  const outH = Math.ceil(gridH / scaleDown);
  const outData = new Float32Array(outW * outH * 2);

  for (let gy = 0; gy < outH; gy++) {
    for (let gx = 0; gx < outW; gx++) {
      const sx = gx * scaleDown;
      const sy = gy * scaleDown;
      if (dimensions[2] > 1) continue;
      const pidx = (sy * gridW + sx);
      const vidx = pidx * 3;
      const oidx = (gy * outW + gx) * 2;
      outData[oidx] = values[vidx] ?? 0;
      outData[oidx + 1] = values[vidx + 1] ?? 0;
    }
  }

  return { width: outW, height: outH, data: outData };
}
