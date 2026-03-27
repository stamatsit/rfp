/**
 * Inpainting Hook
 *
 * Manages the MI-GAN inpainting model lifecycle and inference via a Web Worker.
 * Falls back to the Telea algorithm when the model is not yet loaded.
 *
 * MI-GAN Pipeline v2 format (matching inpaint-web reference implementation):
 * - Image: Uint8Array, CHW layout, RGB, [0-255] (model handles normalization)
 * - Mask: Uint8Array, 1-channel, 0 = inpaint, 255 = keep
 * - Output: Complete composited image (model handles blending)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { teleaInpaint } from '@/lib/inpaint/telea';

// Singleton worker state - shared across hook instances
let workerInstance: Worker | null = null;
let isModelLoaded = false;
let isModelLoading = false;
let modelLoadPromise: Promise<void> | null = null;

interface UseInpaintingReturn {
  inpaint: (imageCanvas: HTMLCanvasElement, maskCanvas: HTMLCanvasElement) => Promise<string | null>;
  inpaintWithTelea: (imageCanvas: HTMLCanvasElement, maskCanvas: HTMLCanvasElement) => string | null;
  isProcessing: boolean;
  isModelReady: boolean;
  isModelLoading: boolean;
  modelProgress: number;
  modelStatus: string;
  error: string | null;
  preloadModel: () => void;
}

export function useInpainting(): UseInpaintingReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isReady, setIsReady] = useState(isModelLoaded);
  const [isLoading, setIsLoading] = useState(isModelLoading);
  const [modelProgress, setModelProgress] = useState(0);
  const [modelStatus, setModelStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef(false);
  const cleanupRef = useRef(false);
  // Track request ID to prevent race conditions from rapid calls
  const requestIdRef = useRef(0);

  // Sync with singleton state on mount
  useEffect(() => {
    setIsReady(isModelLoaded);
    setIsLoading(isModelLoading);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true;
      cleanupRef.current = true;
    };
  }, []);

  const getWorker = useCallback((): Worker => {
    if (!workerInstance) {
      workerInstance = new Worker(
        new URL('../workers/inpaintWorker.ts', import.meta.url),
        { type: 'module' }
      );
      workerInstance.onerror = (e) => {
        console.error('[InpaintWorker] Worker error:', e.message);
        isModelLoading = false;
        setIsLoading(false);
        setError(`Worker error: ${e.message}`);
      };
    }
    return workerInstance;
  }, []);

  const preloadModel = useCallback(() => {
    if (isModelLoaded || isModelLoading) return;

    isModelLoading = true;
    setIsLoading(true);

    const worker = getWorker();

    modelLoadPromise = new Promise<void>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const { type } = e.data;

        switch (type) {
          case 'modelProgress':
            setModelProgress(e.data.progress);
            setModelStatus(e.data.status);
            break;
          case 'modelReady':
            isModelLoaded = true;
            isModelLoading = false;
            setIsReady(true);
            setIsLoading(false);
            setModelProgress(100);
            setModelStatus(`Ready (${e.data.provider})`);
            worker.removeEventListener('message', handler);
            resolve();
            break;
          case 'modelError':
            isModelLoading = false;
            setIsLoading(false);
            setError(e.data.error);
            worker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
            break;
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'loadModel' });
    });
  }, [getWorker]);

  /**
   * Run Telea (instant fallback) inpainting.
   * Uses a larger radius (10) for better quality on medium-sized areas.
   */
  const inpaintWithTelea = useCallback((
    imageCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement
  ): string | null => {
    const w = imageCanvas.width;
    const h = imageCanvas.height;

    const ctx = imageCanvas.getContext('2d');
    if (!ctx) return null;
    const imgData = ctx.getImageData(0, 0, w, h);

    // Ensure mask is the same size as the image
    let maskData: ImageData;
    if (maskCanvas.width === w && maskCanvas.height === h) {
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return null;
      maskData = maskCtx.getImageData(0, 0, w, h);
    } else {
      const resized = document.createElement('canvas');
      resized.width = w;
      resized.height = h;
      const resizedCtx = resized.getContext('2d');
      if (!resizedCtx) return null;
      resizedCtx.drawImage(maskCanvas, 0, 0, w, h);
      maskData = resizedCtx.getImageData(0, 0, w, h);
    }

    // Use radius 15 for better quality (fills larger areas more smoothly)
    const result = teleaInpaint(imgData, maskData, 15);

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = w;
    resultCanvas.height = h;
    const resultCtx = resultCanvas.getContext('2d');
    if (!resultCtx) return null;
    resultCtx.putImageData(result, 0, 0);

    return resultCanvas.toDataURL('image/png');
  }, []);

  /**
   * Convert a canvas to CHW Uint8Array for MI-GAN pipeline v2.
   * Format: Uint8Array, RGB, CHW layout, values [0-255]
   * The pipeline v2 model handles normalization internally.
   */
  function canvasToUint8CHW(canvas: HTMLCanvasElement): Uint8Array {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to get canvas 2D context');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data; // RGBA HWC
    const w = canvas.width;
    const h = canvas.height;
    const size = w * h;
    const chw = new Uint8Array(3 * size);

    for (let i = 0; i < size; i++) {
      chw[i] = pixels[i * 4];             // R
      chw[i + size] = pixels[i * 4 + 1];  // G
      chw[i + 2 * size] = pixels[i * 4 + 2]; // B
    }
    return chw;
  }

  /**
   * Convert mask canvas to Uint8Array for MI-GAN pipeline v2.
   * MI-GAN convention: 0 = area to inpaint, 255 = area to keep.
   * Our mask is white-on-black (white = inpaint), so we invert.
   */
  function maskToUint8(canvas: HTMLCanvasElement, targetW: number, targetH: number): Uint8Array {
    // Resize mask to match image dimensions if needed
    let src = canvas;
    if (canvas.width !== targetW || canvas.height !== targetH) {
      const resized = document.createElement('canvas');
      resized.width = targetW;
      resized.height = targetH;
      const resizedCtx = resized.getContext('2d');
      if (!resizedCtx) throw new Error('Failed to get canvas 2D context');
      resizedCtx.drawImage(canvas, 0, 0, targetW, targetH);
      src = resized;
    }

    const ctx = src.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Failed to get canvas 2D context');
    const pixels = ctx.getImageData(0, 0, targetW, targetH).data;
    const size = targetW * targetH;
    const mask = new Uint8Array(size);

    for (let i = 0; i < size; i++) {
      // Invert: white (255) in our mask → 0 (inpaint) for MI-GAN
      // Black (0) in our mask → 255 (keep) for MI-GAN
      mask[i] = pixels[i * 4] > 128 ? 0 : 255;
    }
    return mask;
  }

  /**
   * Convert MI-GAN output (Uint8Array CHW) back to a data URL.
   */
  function outputToDataURL(data: Uint8Array, width: number, height: number): string {
    const size = width * height;
    const rgba = new Uint8ClampedArray(size * 4);

    for (let i = 0; i < size; i++) {
      rgba[i * 4] = Math.max(0, Math.min(255, data[i]));                 // R
      rgba[i * 4 + 1] = Math.max(0, Math.min(255, data[i + size]));      // G
      rgba[i * 4 + 2] = Math.max(0, Math.min(255, data[i + 2 * size]));  // B
      rgba[i * 4 + 3] = 255;                                              // A
    }

    const imageData = new ImageData(rgba, width, height);
    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = width;
    resultCanvas.height = height;
    const resultCtx = resultCanvas.getContext('2d');
    if (!resultCtx) throw new Error('Failed to get canvas 2D context');
    resultCtx.putImageData(imageData, 0, 0);
    return resultCanvas.toDataURL('image/png');
  }

  /**
   * Run MI-GAN inpainting on image + mask.
   * Follows the inpaint-web reference implementation:
   * - Sends full-resolution image (no cropping)
   * - Uses uint8 format (model handles normalization)
   * - Model returns complete composited result
   */
  const inpaint = useCallback(async (
    imageCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement
  ): Promise<string | null> => {
    // Increment request ID to track this specific call
    const currentRequestId = ++requestIdRef.current;

    setIsProcessing(true);
    setError(null);
    abortRef.current = false;

    try {
      // Ensure model is loaded
      if (!isModelLoaded) {
        if (!modelLoadPromise) {
          preloadModel();
        }
        await modelLoadPromise;
      }

      // Check if a newer request has been made
      if (abortRef.current || currentRequestId !== requestIdRef.current) return null;

      const w = imageCanvas.width;
      const h = imageCanvas.height;

      // Convert image to Uint8 CHW (RGB, 0-255)
      const imageData = canvasToUint8CHW(imageCanvas);

      // Convert mask to Uint8 (0 = inpaint, 255 = keep)
      const maskData = maskToUint8(maskCanvas, w, h);

      // Check if a newer request has been made
      if (abortRef.current || currentRequestId !== requestIdRef.current) return null;

      // Run inference via Web Worker
      const worker = getWorker();

      const result = await new Promise<{ output: Uint8Array; width: number; height: number }>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          if (e.data.type === 'inferResult') {
            worker.removeEventListener('message', handler);
            resolve(e.data);
          } else if (e.data.type === 'inferError') {
            worker.removeEventListener('message', handler);
            reject(new Error(e.data.error));
          }
        };

        worker.addEventListener('message', handler);
        worker.postMessage({
          type: 'infer',
          imageData,
          imageShape: [1, 3, h, w],
          maskData,
          maskShape: [1, 1, h, w],
        });
      });

      // Check if a newer request has been made - discard stale results
      if (abortRef.current || currentRequestId !== requestIdRef.current) return null;

      // Convert output directly to data URL (model returns complete image)
      return outputToDataURL(result.output, result.width, result.height);
    } catch (err: unknown) {
      // Only handle error if this is still the current request
      if (currentRequestId === requestIdRef.current) {
        const message = err instanceof Error ? err.message : 'Inpainting failed';
        setError(message);
        // Fall back to Telea
        return inpaintWithTelea(imageCanvas, maskCanvas);
      }
      return null;
    } finally {
      // Only clear processing state if this is the current request
      if (currentRequestId === requestIdRef.current) {
        setIsProcessing(false);
      }
    }
  }, [getWorker, preloadModel, inpaintWithTelea]);

  return {
    inpaint,
    inpaintWithTelea,
    isProcessing,
    isModelReady: isReady,
    isModelLoading: isLoading,
    modelProgress,
    modelStatus,
    error,
    preloadModel,
  };
}

/**
 * Terminate the inpainting worker to free resources.
 * Call this when the application is closing or when inpainting is no longer needed.
 */
export function terminateInpaintingWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    isModelLoaded = false;
    isModelLoading = false;
    modelLoadPromise = null;
  }
}
