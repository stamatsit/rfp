/**
 * Telea Inpainting Algorithm (Enhanced)
 *
 * Pure TypeScript implementation of the Fast Marching Method (FMM) inpainting
 * algorithm by Alexandru Telea (2004), enhanced with:
 * - Gradient-directed propagation (from the original paper)
 * - Multi-scale pyramid for better quality on larger masked areas
 * - Directional weighting to preserve edges
 *
 * Used as an instant fallback while the MI-GAN model downloads.
 *
 * Reference: "An Image Inpainting Technique Based on the Fast Marching Method"
 * - Alexandru Telea, Journal of Graphics Tools, 2004
 */

// Priority queue entry for the fast marching method
interface HeapEntry {
  dist: number;
  x: number;
  y: number;
}

// Pixel state flags
const KNOWN = 0;
const BAND = 1;
const UNKNOWN = 2;

/**
 * Min-heap for fast marching priority queue
 */
class MinHeap {
  private data: HeapEntry[] = [];

  get size(): number {
    return this.data.length;
  }

  push(entry: HeapEntry): void {
    this.data.push(entry);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): HeapEntry | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].dist <= this.data[i].dist) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].dist < this.data[smallest].dist) smallest = left;
      if (right < n && this.data[right].dist < this.data[smallest].dist) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

/**
 * Inpaint masked regions using a multi-scale Telea approach.
 *
 * For small masks (< 50px diameter), runs single-pass Telea.
 * For larger masks, uses a coarse-to-fine pyramid:
 *   1. Downscale image + mask
 *   2. Inpaint at coarse level (fast, gets overall structure)
 *   3. Upscale result as initialization for fine level
 *   4. Run fine-level Telea with the coarse result as guide
 *
 * @param imageData - Source image data (RGBA)
 * @param maskData - Mask image data (RGBA). White pixels (R > 128) = inpaint region.
 * @param inpaintRadius - Neighborhood radius for inpainting (default 10)
 * @returns New ImageData with inpainted result
 */
export function teleaInpaint(
  imageData: ImageData,
  maskData: ImageData,
  inpaintRadius: number = 10
): ImageData {
  const w = imageData.width;
  const h = imageData.height;

  // Measure mask extent to decide if we need multi-scale
  const maskExtent = getMaskExtent(maskData);
  const maskDiameter = Math.max(maskExtent.w, maskExtent.h);

  // For small masks, single-pass is fine
  if (maskDiameter < 50) {
    return teleaInpaintSinglePass(imageData, maskData, inpaintRadius);
  }

  // Multi-scale: coarse pass at half resolution, then refine
  const halfW = Math.max(1, Math.round(w / 2));
  const halfH = Math.max(1, Math.round(h / 2));

  const halfImage = downsampleImageData(imageData, halfW, halfH);
  const halfMask = downsampleMask(maskData, halfW, halfH);

  // Inpaint at half resolution with proportionally scaled radius
  const coarseResult = teleaInpaintSinglePass(halfImage, halfMask, Math.max(5, Math.round(inpaintRadius / 2)));

  // Upscale coarse result back to full resolution
  const upscaled = upsampleImageData(coarseResult, w, h);

  // Use coarse result as initialization: replace masked pixels in the source
  // with the upscaled coarse result, then run a fine pass
  const guidedSrc = new Uint8ClampedArray(imageData.data);
  const maskPixels = maskData.data;
  for (let i = 0; i < w * h; i++) {
    if (maskPixels[i * 4] > 128) {
      guidedSrc[i * 4] = upscaled.data[i * 4];
      guidedSrc[i * 4 + 1] = upscaled.data[i * 4 + 1];
      guidedSrc[i * 4 + 2] = upscaled.data[i * 4 + 2];
      guidedSrc[i * 4 + 3] = 255;
    }
  }
  const guidedImage = new ImageData(guidedSrc, w, h);

  // Fine pass with full radius — now the masked region has a coarse fill
  // so the FMM propagation will refine edges and details
  return teleaInpaintSinglePass(guidedImage, maskData, inpaintRadius);
}

/**
 * Single-pass Telea FMM inpainting with gradient-directed propagation.
 */
function teleaInpaintSinglePass(
  imageData: ImageData,
  maskData: ImageData,
  inpaintRadius: number
): ImageData {
  const w = imageData.width;
  const h = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const mask = maskData.data;

  // Initialize state and distance arrays
  const state = new Uint8Array(w * h);
  const dist = new Float32Array(w * h);
  // Store gradient of the distance field for directional weighting
  const gradX = new Float32Array(w * h);
  const gradY = new Float32Array(w * h);
  const heap = new MinHeap();

  // Initialize: classify pixels as KNOWN or UNKNOWN based on mask
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const maskIdx = idx * 4;
      if (mask[maskIdx] > 128) {
        state[idx] = UNKNOWN;
        dist[idx] = 1e6;
      } else {
        state[idx] = KNOWN;
        dist[idx] = 0;
      }
    }
  }

  // Find initial band: UNKNOWN pixels adjacent to KNOWN pixels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (state[idx] !== UNKNOWN) continue;

      if (
        (x > 0 && state[idx - 1] === KNOWN) ||
        (x < w - 1 && state[idx + 1] === KNOWN) ||
        (y > 0 && state[idx - w] === KNOWN) ||
        (y < h - 1 && state[idx + w] === KNOWN)
      ) {
        state[idx] = BAND;
        dist[idx] = 1.0;
        heap.push({ dist: 1.0, x, y });
      }
    }
  }

  // Fast Marching: process pixels from closest to farthest
  while (heap.size > 0) {
    const current = heap.pop()!;
    const { x, y } = current;
    const idx = y * w + x;

    if (state[idx] === KNOWN) continue;
    state[idx] = KNOWN;

    // Compute gradient of distance field at this pixel (for directional weighting)
    computeGradient(dist, state, gradX, gradY, x, y, w, h);

    // Inpaint this pixel using gradient-directed weighted average
    inpaintPixel(src, state, dist, gradX, gradY, x, y, w, h, inpaintRadius);

    // Add UNKNOWN neighbors to the band with eikonal distance update
    const nx4 = [x - 1, x + 1, x, x];
    const ny4 = [y, y, y - 1, y + 1];
    for (let n = 0; n < 4; n++) {
      const nx = nx4[n], ny = ny4[n];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (state[nIdx] !== UNKNOWN) continue;

      state[nIdx] = BAND;
      // Eikonal-like distance: solve |grad T| = 1
      const newDist = solveEikonal(dist, state, nx, ny, w, h);
      dist[nIdx] = newDist;
      heap.push({ dist: newDist, x: nx, y: ny });
    }
  }

  return new ImageData(src, w, h);
}

/**
 * Solve the eikonal equation |grad T| = 1 at pixel (x,y).
 * Uses the upwind scheme from the Fast Marching Method.
 */
function solveEikonal(dist: Float32Array, state: Uint8Array, x: number, y: number, w: number, h: number): number {
  let a = 1e6, b = 1e6;

  // Horizontal neighbors
  if (x > 0 && state[y * w + x - 1] === KNOWN) a = Math.min(a, dist[y * w + x - 1]);
  if (x < w - 1 && state[y * w + x + 1] === KNOWN) a = Math.min(a, dist[y * w + x + 1]);

  // Vertical neighbors
  if (y > 0 && state[(y - 1) * w + x] === KNOWN) b = Math.min(b, dist[(y - 1) * w + x]);
  if (y < h - 1 && state[(y + 1) * w + x] === KNOWN) b = Math.min(b, dist[(y + 1) * w + x]);

  // Solve quadratic: (T - a)^2 + (T - b)^2 = 1
  if (a === 1e6) return b + 1;
  if (b === 1e6) return a + 1;

  const diff = a - b;
  if (Math.abs(diff) >= 1) {
    return Math.min(a, b) + 1;
  }
  return (a + b + Math.sqrt(2 - diff * diff)) / 2;
}

/**
 * Compute gradient of the distance field at pixel (x,y) using central differences.
 */
function computeGradient(
  dist: Float32Array, state: Uint8Array,
  gradX: Float32Array, gradY: Float32Array,
  x: number, y: number, w: number, h: number
): void {
  const idx = y * w + x;

  // Central differences for gradient, using only KNOWN neighbors
  let gx = 0, gy = 0;

  if (x > 0 && x < w - 1) {
    const li = y * w + (x - 1);
    const ri = y * w + (x + 1);
    const lv = state[li] === KNOWN ? dist[li] : dist[idx];
    const rv = state[ri] === KNOWN ? dist[ri] : dist[idx];
    gx = (rv - lv) / 2;
  } else if (x > 0) {
    gx = dist[idx] - dist[y * w + (x - 1)];
  } else if (x < w - 1) {
    gx = dist[y * w + (x + 1)] - dist[idx];
  }

  if (y > 0 && y < h - 1) {
    const ui = (y - 1) * w + x;
    const di = (y + 1) * w + x;
    const uv = state[ui] === KNOWN ? dist[ui] : dist[idx];
    const dv = state[di] === KNOWN ? dist[di] : dist[idx];
    gy = (dv - uv) / 2;
  } else if (y > 0) {
    gy = dist[idx] - dist[(y - 1) * w + x];
  } else if (y < h - 1) {
    gy = dist[(y + 1) * w + x] - dist[idx];
  }

  // Normalize
  const len = Math.sqrt(gx * gx + gy * gy) + 1e-8;
  gradX[idx] = gx / len;
  gradY[idx] = gy / len;
}

/**
 * Inpaint a single pixel using the full Telea weighting:
 * w(q) = dir(q) * dst(q) * lev(q)
 *
 * - dir: directional weight (dot product of gradient and direction to neighbor)
 * - dst: geometric distance weight (1/r^2)
 * - lev: level set (distance field) weight
 *
 * This produces much better edge preservation than simple distance weighting.
 */
function inpaintPixel(
  data: Uint8ClampedArray,
  state: Uint8Array,
  dist: Float32Array,
  gradX: Float32Array,
  gradY: Float32Array,
  px: number,
  py: number,
  w: number,
  h: number,
  radius: number
): void {
  let sumR = 0, sumG = 0, sumB = 0;
  let totalWeight = 0;

  const r2 = radius * radius;
  const pIdx = py * w + px;
  const gx = gradX[pIdx];
  const gy = gradY[pIdx];

  const startY = Math.max(0, py - radius);
  const endY = Math.min(h - 1, py + radius);
  const startX = Math.max(0, px - radius);
  const endX = Math.min(w - 1, px + radius);

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      const idx = y * w + x;
      if (state[idx] !== KNOWN) continue;

      const dx = x - px;
      const dy = y - py;
      const d2 = dx * dx + dy * dy;

      if (d2 > r2 || d2 === 0) continue;

      const d = Math.sqrt(d2);

      // Directional weight: favor pixels along the gradient direction
      // (pixels that the level set "points toward")
      const dirWeight = Math.abs(dx * gx + dy * gy) / d;

      // Geometric distance weight
      const dstWeight = 1.0 / (d2);

      // Level set weight: prefer pixels closer to the boundary
      const levWeight = 1.0 / (1.0 + Math.abs(dist[idx]));

      // Combined weight (Telea formula)
      const weight = (0.2 + dirWeight) * dstWeight * levWeight;

      const pixelIdx = idx * 4;
      sumR += data[pixelIdx] * weight;
      sumG += data[pixelIdx + 1] * weight;
      sumB += data[pixelIdx + 2] * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight > 0) {
    const pixelIdx = pIdx * 4;
    data[pixelIdx] = Math.round(sumR / totalWeight);
    data[pixelIdx + 1] = Math.round(sumG / totalWeight);
    data[pixelIdx + 2] = Math.round(sumB / totalWeight);
    data[pixelIdx + 3] = 255;
  }
}

/**
 * Measure the bounding box extent of the mask's white region.
 */
function getMaskExtent(maskData: ImageData): { w: number; h: number } {
  const w = maskData.width;
  const h = maskData.height;
  const d = maskData.data;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4] > 128) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!found) return { w: 0, h: 0 };
  return { w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Downsample ImageData using area averaging for better quality.
 */
function downsampleImageData(src: ImageData, tw: number, th: number): ImageData {
  const sw = src.width, sh = src.height;
  const sd = src.data;
  const result = new Uint8ClampedArray(tw * th * 4);

  const scaleX = sw / tw;
  const scaleY = sh / th;

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = Math.floor(tx * scaleX);
      const sy0 = Math.floor(ty * scaleY);
      const sx1 = Math.min(Math.ceil((tx + 1) * scaleX), sw);
      const sy1 = Math.min(Math.ceil((ty + 1) * scaleY), sh);

      let r = 0, g = 0, b = 0, count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const si = (sy * sw + sx) * 4;
          r += sd[si]; g += sd[si + 1]; b += sd[si + 2];
          count++;
        }
      }

      const di = (ty * tw + tx) * 4;
      result[di] = Math.round(r / count);
      result[di + 1] = Math.round(g / count);
      result[di + 2] = Math.round(b / count);
      result[di + 3] = 255;
    }
  }

  return new ImageData(result, tw, th);
}

/**
 * Downsample a mask: if any source pixel in the block is white, target is white.
 */
function downsampleMask(src: ImageData, tw: number, th: number): ImageData {
  const sw = src.width, sh = src.height;
  const sd = src.data;
  const result = new Uint8ClampedArray(tw * th * 4);

  const scaleX = sw / tw;
  const scaleY = sh / th;

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const sx0 = Math.floor(tx * scaleX);
      const sy0 = Math.floor(ty * scaleY);
      const sx1 = Math.min(Math.ceil((tx + 1) * scaleX), sw);
      const sy1 = Math.min(Math.ceil((ty + 1) * scaleY), sh);

      let hasWhite = false;
      for (let sy = sy0; sy < sy1 && !hasWhite; sy++) {
        for (let sx = sx0; sx < sx1 && !hasWhite; sx++) {
          if (sd[(sy * sw + sx) * 4] > 128) hasWhite = true;
        }
      }

      const di = (ty * tw + tx) * 4;
      const v = hasWhite ? 255 : 0;
      result[di] = v;
      result[di + 1] = v;
      result[di + 2] = v;
      result[di + 3] = 255;
    }
  }

  return new ImageData(result, tw, th);
}

/**
 * Upsample ImageData using bilinear interpolation.
 */
function upsampleImageData(src: ImageData, tw: number, th: number): ImageData {
  const sw = src.width, sh = src.height;
  const sd = src.data;
  const result = new Uint8ClampedArray(tw * th * 4);

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      // Map target to source coordinates
      const sx = (tx + 0.5) * sw / tw - 0.5;
      const sy = (ty + 0.5) * sh / th - 0.5;

      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);

      const fx = sx - x0;
      const fy = sy - y0;

      const di = (ty * tw + tx) * 4;
      for (let c = 0; c < 3; c++) {
        const v00 = sd[(y0 * sw + x0) * 4 + c];
        const v10 = sd[(y0 * sw + x1) * 4 + c];
        const v01 = sd[(y1 * sw + x0) * 4 + c];
        const v11 = sd[(y1 * sw + x1) * 4 + c];

        const top = v00 + (v10 - v00) * fx;
        const bot = v01 + (v11 - v01) * fx;
        result[di + c] = Math.round(top + (bot - top) * fy);
      }
      result[di + 3] = 255;
    }
  }

  return new ImageData(result, tw, th);
}
