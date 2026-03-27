/**
 * Inpainting Web Worker
 *
 * Runs MI-GAN Pipeline v2 ONNX inference off the main thread.
 * Handles model downloading, caching (IndexedDB via localforage),
 * and inference with WebGPU/WASM fallback.
 *
 * MI-GAN Pipeline v2 format (matching inpaint-web):
 * - Input image: uint8, [1, 3, H, W], RGB, [0-255]
 * - Input mask: uint8, [1, 1, H, W], 0=inpaint, 255=keep
 * - Output: uint8, [1, 3, H, W], complete composited image
 */

import localforage from 'localforage';

const MODEL_CACHE_KEY = 'migan-model-v2';
const MODEL_URL = 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx';

let ort: any = null;
let session: any = null;

type InMessage =
  | { type: 'loadModel' }
  | { type: 'infer'; imageData: Uint8Array; imageShape: number[]; maskData: Uint8Array; maskShape: number[] }
  | { type: 'dispose' };

type OutMessage =
  | { type: 'modelProgress'; progress: number; status: string }
  | { type: 'modelReady'; provider: string }
  | { type: 'modelError'; error: string }
  | { type: 'inferResult'; output: Uint8Array; width: number; height: number }
  | { type: 'inferError'; error: string };

function postMsg(msg: OutMessage) {
  self.postMessage(msg);
}

async function downloadModel(): Promise<ArrayBuffer> {
  postMsg({ type: 'modelProgress', progress: 5, status: 'Checking cache...' });

  try {
    const cached = await localforage.getItem<ArrayBuffer>(MODEL_CACHE_KEY);
    if (cached && cached.byteLength > 1_000_000) {
      postMsg({ type: 'modelProgress', progress: 40, status: 'Loaded from cache' });
      return cached;
    }
  } catch {
    // Cache miss
  }

  postMsg({ type: 'modelProgress', progress: 10, status: 'Downloading MI-GAN model...' });

  const response = await fetch(MODEL_URL, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
  }

  const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ReadableStream not supported');

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    if (contentLength > 0) {
      const pct = Math.round((received / contentLength) * 30) + 10;
      postMsg({ type: 'modelProgress', progress: pct, status: `Downloading... ${Math.round(received / 1024 / 1024)}MB` });
    }
  }

  const buffer = new ArrayBuffer(received);
  const view = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    view.set(chunk, offset);
    offset += chunk.byteLength;
  }

  postMsg({ type: 'modelProgress', progress: 40, status: 'Caching model...' });
  try {
    await localforage.setItem(MODEL_CACHE_KEY, buffer);
  } catch {
    // Cache failed but we can continue
  }

  return buffer;
}

async function loadModel(): Promise<void> {
  try {
    postMsg({ type: 'modelProgress', progress: 0, status: 'Loading ONNX Runtime...' });
    ort = await import('onnxruntime-web');

    // WASM path must match the installed onnxruntime-web version exactly
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
    // Prevent nested worker issues (we're already in a worker)
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;

    const modelBuffer = await downloadModel();

    postMsg({ type: 'modelProgress', progress: 50, status: 'Creating inference session...' });

    const providers = ['webgpu', 'wasm'];
    const errors: string[] = [];
    for (const ep of providers) {
      try {
        postMsg({ type: 'modelProgress', progress: 60, status: `Trying ${ep} backend...` });
        session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: [ep],
        });
        postMsg({ type: 'modelProgress', progress: 100, status: `Ready (${ep})` });
        postMsg({ type: 'modelReady', provider: ep });
        return;
      } catch (epErr: any) {
        errors.push(`${ep}: ${epErr.message || epErr}`);
        continue;
      }
    }

    throw new Error(`No backend available. ${errors.join('; ')}`);
  } catch (err: any) {
    postMsg({ type: 'modelError', error: err.message || 'Failed to load model' });
  }
}

/**
 * Run MI-GAN Pipeline v2 inference.
 * Input: uint8 tensors (model handles normalization/denormalization internally).
 * Output: uint8 complete composited image.
 */
async function runInference(
  imageData: Uint8Array,
  imageShape: number[],
  maskData: Uint8Array,
  maskShape: number[]
): Promise<void> {
  if (!session || !ort) {
    postMsg({ type: 'inferError', error: 'Model not loaded' });
    return;
  }

  try {
    // Use uint8 tensors (matching inpaint-web reference implementation)
    const imageTensor = new ort.Tensor('uint8', imageData, imageShape);
    const maskTensor = new ort.Tensor('uint8', maskData, maskShape);

    const inputNames = session.inputNames;
    const feeds: Record<string, any> = {};

    if (inputNames.length >= 2) {
      feeds[inputNames[0]] = imageTensor;
      feeds[inputNames[1]] = maskTensor;
    } else {
      feeds['image'] = imageTensor;
      feeds['mask'] = maskTensor;
    }

    const results = await session.run(feeds);

    const outputName = session.outputNames[0];
    const output = results[outputName];

    // Output is uint8 CHW from the pipeline v2 model
    const outputData = output.data instanceof Uint8Array
      ? output.data
      : new Uint8Array(output.data);

    const [, , height, width] = output.dims;

    postMsg({
      type: 'inferResult',
      output: outputData,
      width,
      height,
    });
  } catch (err: any) {
    postMsg({ type: 'inferError', error: err.message || 'Inference failed' });
  }
}

self.onmessage = async (e: MessageEvent<InMessage>) => {
  const { type } = e.data;

  switch (type) {
    case 'loadModel':
      await loadModel();
      break;
    case 'infer':
      await runInference(
        e.data.imageData,
        e.data.imageShape,
        e.data.maskData,
        e.data.maskShape
      );
      break;
    case 'dispose':
      if (session) {
        session.release();
        session = null;
      }
      break;
  }
};
