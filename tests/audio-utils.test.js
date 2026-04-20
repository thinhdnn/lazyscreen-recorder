const {
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
} = require('../src/renderer/audio-utils');

// ─── mergeToMonoFloat32 ─────────────────────────────────────────────────────

describe('mergeToMonoFloat32', () => {
  test('averages left and right channels', () => {
    const left = new Float32Array([0.5, -0.5, 1.0]);
    const right = new Float32Array([0.5, 0.5, -1.0]);
    const result = mergeToMonoFloat32(left, right);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.0);
    expect(result[2]).toBeCloseTo(0.0);
  });

  test('duplicates left channel when right is null', () => {
    const left = new Float32Array([0.3, 0.7, -0.2]);
    const result = mergeToMonoFloat32(left, null);
    expect(result[0]).toBeCloseTo(0.3);
    expect(result[1]).toBeCloseTo(0.7);
    expect(result[2]).toBeCloseTo(-0.2);
  });

  test('handles empty arrays', () => {
    const left = new Float32Array([]);
    const right = new Float32Array([]);
    const result = mergeToMonoFloat32(left, right);
    expect(result.length).toBe(0);
  });

  test('result has same length as input', () => {
    const left = new Float32Array(1024);
    const right = new Float32Array(1024);
    const result = mergeToMonoFloat32(left, right);
    expect(result.length).toBe(1024);
  });
});

// ─── downsampleTo16k ────────────────────────────────────────────────────────

describe('downsampleTo16k', () => {
  test('returns same array when input rate is 16000', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const result = downsampleTo16k(input, 16000);
    expect(result).toBe(input);
  });

  test('downsamples 48000 to 16000 (ratio 3)', () => {
    const input = new Float32Array(4800);
    for (let i = 0; i < input.length; i++) input[i] = Math.sin(i / 10);
    const result = downsampleTo16k(input, 48000);
    expect(result.length).toBe(1600);
  });

  test('downsamples 44100 to 16000', () => {
    const input = new Float32Array(4410);
    for (let i = 0; i < input.length; i++) input[i] = 0.5;
    const result = downsampleTo16k(input, 44100);
    const expected = Math.round(4410 / (44100 / 16000));
    expect(result.length).toBe(expected);
  });

  test('handles empty input', () => {
    const input = new Float32Array(0);
    const result = downsampleTo16k(input, 48000);
    expect(result.length).toBe(0);
  });

  test('preserves DC signal value approximately', () => {
    const input = new Float32Array(480).fill(0.5);
    const result = downsampleTo16k(input, 48000);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toBeCloseTo(0.5, 1);
    }
  });
});

// ─── floatTo16BitPCM ────────────────────────────────────────────────────────

describe('floatTo16BitPCM', () => {
  test('returns ArrayBuffer with correct byte size', () => {
    const input = new Float32Array(100);
    const result = floatTo16BitPCM(input);
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(200);
  });

  test('encodes silence as zero', () => {
    const input = new Float32Array([0, 0, 0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(0);
    expect(view.getInt16(2, true)).toBe(0);
    expect(view.getInt16(4, true)).toBe(0);
  });

  test('encodes max positive value', () => {
    const input = new Float32Array([1.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(32767);
  });

  test('encodes max negative value', () => {
    const input = new Float32Array([-1.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(-32768);
  });

  test('clamps values beyond [-1, 1]', () => {
    const input = new Float32Array([2.0, -3.0]);
    const result = floatTo16BitPCM(input);
    const view = new DataView(result);
    expect(view.getInt16(0, true)).toBe(32767);
    expect(view.getInt16(2, true)).toBe(-32768);
  });

  test('handles empty input', () => {
    const input = new Float32Array(0);
    const result = floatTo16BitPCM(input);
    expect(result.byteLength).toBe(0);
  });
});

// ─── computeRmsFloat32 ─────────────────────────────────────────────────────

describe('computeRmsFloat32', () => {
  test('returns 0 for silence', () => {
    const silence = new Float32Array(100).fill(0);
    expect(computeRmsFloat32(silence)).toBe(0);
  });

  test('returns correct RMS for constant signal', () => {
    const signal = new Float32Array(100).fill(0.5);
    expect(computeRmsFloat32(signal)).toBeCloseTo(0.5, 5);
  });

  test('returns correct RMS for known values', () => {
    const signal = new Float32Array([1, -1, 1, -1]);
    expect(computeRmsFloat32(signal)).toBeCloseTo(1.0, 5);
  });

  test('returns 1.0 for DC signal of 1.0', () => {
    const signal = new Float32Array(10).fill(1.0);
    expect(computeRmsFloat32(signal)).toBeCloseTo(1.0, 5);
  });

  test('positive for any non-zero signal', () => {
    const signal = new Float32Array([0.001]);
    expect(computeRmsFloat32(signal)).toBeGreaterThan(0);
  });
});

// ─── VAD RMS Fallback ───────────────────────────────────────────────────────

describe('vadStepRmsFallback', () => {
  test('activates speaking when RMS exceeds high threshold', () => {
    const state = createVadRmsState();
    const result = vadStepRmsFallback(state, VAD_RMS_HIGH + 0.001);
    expect(result).toBe(true);
    expect(state.speaking).toBe(true);
  });

  test('remains speaking for RMS between thresholds', () => {
    const state = createVadRmsState();
    vadStepRmsFallback(state, VAD_RMS_HIGH + 0.001);
    const result = vadStepRmsFallback(state, (VAD_RMS_HIGH + VAD_RMS_LOW) / 2);
    expect(result).toBe(true);
  });

  test('deactivates after enough quiet frames', () => {
    const state = createVadRmsState();
    vadStepRmsFallback(state, VAD_RMS_HIGH + 0.01);
    expect(state.speaking).toBe(true);

    for (let i = 0; i < VAD_MAX_QUIET_FRAMES; i++) {
      vadStepRmsFallback(state, VAD_RMS_LOW - 0.001);
    }
    expect(state.speaking).toBe(false);
  });

  test('resets quiet counter on loud frame', () => {
    const state = createVadRmsState();
    vadStepRmsFallback(state, VAD_RMS_HIGH + 0.01);

    for (let i = 0; i < VAD_MAX_QUIET_FRAMES - 1; i++) {
      vadStepRmsFallback(state, VAD_RMS_LOW - 0.001);
    }
    vadStepRmsFallback(state, VAD_RMS_HIGH + 0.01);
    expect(state.speaking).toBe(true);
    expect(state.quietRun).toBe(0);
  });

  test('stays not speaking when never activated', () => {
    const state = createVadRmsState();
    for (let i = 0; i < 20; i++) {
      vadStepRmsFallback(state, VAD_RMS_LOW - 0.001);
    }
    expect(state.speaking).toBe(false);
  });

  test('middle zone RMS resets quiet counter but does not change state', () => {
    const state = createVadRmsState();
    vadStepRmsFallback(state, VAD_RMS_HIGH + 0.01);

    vadStepRmsFallback(state, VAD_RMS_LOW - 0.001);
    vadStepRmsFallback(state, VAD_RMS_LOW - 0.001);
    expect(state.quietRun).toBe(2);

    vadStepRmsFallback(state, (VAD_RMS_HIGH + VAD_RMS_LOW) / 2);
    expect(state.quietRun).toBe(0);
    expect(state.speaking).toBe(true);
  });
});

// ─── videoBitrateForRecordingQuality ────────────────────────────────────────

describe('videoBitrateForRecordingQuality', () => {
  test('returns 3.0Mbps for balance', () => {
    expect(videoBitrateForRecordingQuality('balance')).toBe(3_000_000);
  });

  test('returns 5.0Mbps for normal', () => {
    expect(videoBitrateForRecordingQuality('normal')).toBe(5_000_000);
  });

  test('returns 8.0Mbps for high quality', () => {
    expect(videoBitrateForRecordingQuality('high')).toBe(8_000_000);
  });

  test('returns normal bitrate for unknown quality', () => {
    expect(videoBitrateForRecordingQuality(undefined)).toBe(5_000_000);
    expect(videoBitrateForRecordingQuality('hd')).toBe(5_000_000);
  });
});
