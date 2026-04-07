const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * @param {'normal'|'compact'} recordingQuality
 */
function getEncodingProfile(recordingQuality) {
  if (recordingQuality === 'compact') {
    return {
      crf: 26,
      preset: 'veryfast',
      audioK: '96k',
    };
  }
  return {
    crf: 23,
    preset: 'veryfast',
    audioK: '128k',
  };
}

function probeHasAudio(inputPath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) return resolve(false);
      const hasAudio = metadata.streams.some((s) => s.codec_type === 'audio');
      resolve(hasAudio);
    });
  });
}

/**
 * Convert a WebM recording to a lightweight H.264 MP4.
 * Optionally crops to a rectangle (for area-mode recordings).
 * @param {'normal'|'compact'} [recordingQuality]
 */
async function convertToMp4(inputPath, outputPath, cropRect, recordingQuality, onProgress) {
  const hasAudio = await probeHasAudio(inputPath);
  const enc = getEncodingProfile(recordingQuality);

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',
        `-preset ${enc.preset}`,
        `-crf ${enc.crf}`,
        '-pix_fmt yuv420p',
        '-movflags +faststart',
      ]);

    if (cropRect) {
      const { x, y, width, height } = cropRect;
      command = command.videoFilter(`crop=${width}:${height}:${x}:${y}`);
    }

    if (hasAudio) {
      command = command.outputOptions([
        '-c:a aac',
        `-b:a ${enc.audioK}`,
        '-ac 2',
      ]);
    } else {
      command = command.noAudio();
    }

    command
      .on('start', (cmd) => {
        console.log('[ffmpeg] Started:', cmd);
      })
      .on('progress', (progress) => {
        if (typeof onProgress === 'function') {
          const pct = progress.percent;
          if (pct != null && !Number.isNaN(pct)) {
            onProgress({
              message: `Converting to MP4… ${Math.round(pct)}%`,
              percent: Math.min(100, Math.round(pct)),
            });
          }
        }
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[ffmpeg] Error:', err.message);
        console.error('[ffmpeg] stderr:', stderr);
        reject(err);
      })
      .on('end', () => {
        console.log('[ffmpeg] Conversion complete:', outputPath);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

/**
 * Burn subtitles into video (H.264 + copy audio). subtitlePath must be SRT or ASS.
 */
async function burnSubtitlesIntoVideo(
  inputPath,
  subtitlePath,
  outputPath,
  onProgress,
  recordingQuality
) {
  const hasAudio = await probeHasAudio(inputPath);
  const enc = getEncodingProfile(recordingQuality);
  const subForFilter = subtitlePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "'\\''");
  const vf = `subtitles='${subForFilter}'`;

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath).outputOptions([
      '-c:v libx264',
      `-preset ${enc.preset}`,
      `-crf ${enc.crf}`,
      '-pix_fmt yuv420p',
      '-movflags +faststart',
    ]);

    if (hasAudio) {
      command = command.outputOptions(['-c:a copy']);
    } else {
      command = command.noAudio();
    }

    command = command.videoFilters(vf);

    command
      .on('start', (cmd) => {
        console.log('[ffmpeg burn] Started:', cmd);
      })
      .on('progress', (progress) => {
        if (typeof onProgress === 'function') {
          const pct = progress.percent;
          if (pct != null && !Number.isNaN(pct)) {
            onProgress({
              message: `Burning subtitles… ${Math.round(pct)}%`,
              percent: Math.min(100, Math.round(pct)),
            });
          }
        }
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[ffmpeg burn] Error:', err.message);
        console.error('[ffmpeg burn] stderr:', stderr);
        reject(err);
      })
      .on('end', () => {
        console.log('[ffmpeg burn] Complete:', outputPath);
        resolve(outputPath);
      })
      .save(outputPath);
  });
}

module.exports = {
  convertToMp4,
  burnSubtitlesIntoVideo,
  getEncodingProfile,
};
