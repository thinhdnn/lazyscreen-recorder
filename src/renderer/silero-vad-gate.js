/**
 * Silero VAD (via @ricky0123/vad-web) — bundled separately with esbuild.
 * Exposes window.SileroVadGate.createSileroSpeechGate(...)
 */
import * as ort from 'onnxruntime-web/wasm';
import { SileroV5 } from '@ricky0123/vad-web/dist/models/v5.js';
import {
  FrameProcessor,
  defaultFrameProcessorOptions,
} from '@ricky0123/vad-web/dist/frame-processor.js';
import { defaultModelFetcher } from '@ricky0123/vad-web/dist/default-model-fetcher.js';
import { Message } from '@ricky0123/vad-web/dist/messages.js';
import { Resampler } from '@ricky0123/vad-web/dist/resampler.js';

const VAD_WEB_VERSION = '0.0.30';
const MODEL_URL = `https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@${VAD_WEB_VERSION}/dist/silero_vad_v5.onnx`;

/**
 * @param {{ onnxWasmBaseUrl: string }} opts
 */
async function createSileroSpeechGate(opts) {
  const { onnxWasmBaseUrl } = opts;
  if (!onnxWasmBaseUrl) {
    throw new Error('Silero VAD: onnxWasmBaseUrl is required');
  }

  ort.env.wasm.wasmPaths = onnxWasmBaseUrl;
  ort.env.wasm.numThreads = 1;

  const model = await SileroV5.new(ort, () => defaultModelFetcher(MODEL_URL));

  const frameSamples = 512;
  const msPerFrame = frameSamples / 16;

  let vadActive = false;
  let resampler = null;
  /** @type {number | null} */
  let lastNativeRate = null;

  const frameProcessor = new FrameProcessor(
    model.process,
    model.reset_state,
    { ...defaultFrameProcessorOptions },
    msPerFrame
  );

  const handleEvent = (ev) => {
    switch (ev.msg) {
      case Message.SpeechStart:
        vadActive = true;
        break;
      case Message.SpeechEnd:
      case Message.VADMisfire:
        vadActive = false;
        break;
      default:
        break;
    }
  };

  frameProcessor.resume();

  return {
    /**
     * @param {Float32Array} monoFloat32
     * @param {number} nativeSampleRate
     * @returns {Promise<boolean>}
     */
    async processChunk(monoFloat32, nativeSampleRate) {
      if (lastNativeRate !== nativeSampleRate) {
        resampler = new Resampler({
          nativeSampleRate,
          targetSampleRate: 16000,
          targetFrameSize: frameSamples,
        });
        lastNativeRate = nativeSampleRate;
      }
      const frames = resampler.process(monoFloat32);
      for (let i = 0; i < frames.length; i += 1) {
        await frameProcessor.process(frames[i], handleEvent);
      }
      return vadActive;
    },
    reset() {
      frameProcessor.reset();
      vadActive = false;
    },
    async dispose() {
      await model.release();
      resampler = null;
      lastNativeRate = null;
    },
  };
}

if (typeof window !== 'undefined') {
  window.SileroVadGate = { createSileroSpeechGate };
}
