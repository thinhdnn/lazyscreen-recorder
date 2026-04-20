function mergeToMonoFloat32(leftChannel, rightChannel) {
  const merged = new Float32Array(leftChannel.length);
  for (let i = 0; i < leftChannel.length; i += 1) {
    const right = rightChannel ? rightChannel[i] : leftChannel[i];
    merged[i] = (leftChannel[i] + right) / 2;
  }
  return merged;
}

function downsampleTo16k(float32Audio, inputRate) {
  if (inputRate === 16000) return float32Audio;
  const ratio = inputRate / 16000;
  const newLength = Math.round(float32Audio.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffset = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffset && i < float32Audio.length; i += 1) {
      accum += float32Audio[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffset;
  }
  return result;
}

function floatTo16BitPCM(float32Audio) {
  const buffer = new ArrayBuffer(float32Audio.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Audio.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32Audio[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

function computeRmsFloat32(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i];
    sum += x * x;
  }
  return Math.sqrt(sum / samples.length);
}

const VAD_RMS_HIGH = 0.018;
const VAD_RMS_LOW = 0.008;
const VAD_MAX_QUIET_FRAMES = 9;

function createVadRmsState() {
  return { quietRun: 0, speaking: false };
}

function vadStepRmsFallback(state, rms) {
  if (rms > VAD_RMS_HIGH) {
    state.speaking = true;
    state.quietRun = 0;
  } else if (rms < VAD_RMS_LOW) {
    state.quietRun += 1;
    if (state.quietRun >= VAD_MAX_QUIET_FRAMES) {
      state.speaking = false;
      state.quietRun = 0;
    }
  } else {
    state.quietRun = 0;
  }
  return state.speaking;
}

function videoBitrateForRecordingQuality(q) {
  if (q === 'balance') return 3_000_000;
  if (q === 'high') return 8_000_000;
  return 5_000_000;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mergeToMonoFloat32,
    downsampleTo16k,
    floatTo16BitPCM,
    computeRmsFloat32,
    createVadRmsState,
    vadStepRmsFallback,
    videoBitrateForRecordingQuality,
    VAD_RMS_HIGH,
    VAD_RMS_LOW,
    VAD_MAX_QUIET_FRAMES,
  };
}
