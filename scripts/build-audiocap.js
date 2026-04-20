const { execFileSync } = require('child_process');
const { cpSync, existsSync, mkdirSync } = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function buildMacAudioCap() {
  if (process.platform !== 'darwin') {
    console.log('[audiocap][mac] Skip: not running on macOS');
    return;
  }
  const swiftDir = path.join(ROOT, 'swift-audiocap');
  const outDir = path.join(ROOT, 'audiocap-bin', 'mac');
  try {
    execFileSync('swift', ['--version'], { stdio: 'pipe' });
  } catch (_) {
    console.warn('[audiocap][mac] Swift toolchain not found, skipping');
    return;
  }
  console.log('[audiocap][mac] Building ScreenCaptureKit helper...');
  try {
    execFileSync(
      'swift',
      ['build', '-c', 'release', '--package-path', swiftDir, '--arch', 'arm64', '--arch', 'x86_64'],
      { stdio: 'inherit' }
    );
  } catch (_) {
    console.log('[audiocap][mac] Universal build failed; trying current arch');
    execFileSync('swift', ['build', '-c', 'release', '--package-path', swiftDir], {
      stdio: 'inherit',
    });
  }
  const universalBin = path.join(
    swiftDir,
    '.build',
    'apple',
    'Products',
    'Release',
    'audiocap'
  );
  const singleArchBin = path.join(swiftDir, '.build', 'release', 'audiocap');
  const builtBin = existsSync(universalBin) ? universalBin : singleArchBin;
  if (!existsSync(builtBin)) {
    throw new Error('[audiocap][mac] Build succeeded but binary not found');
  }
  mkdirSync(outDir, { recursive: true });
  cpSync(builtBin, path.join(outDir, 'audiocap'));
  console.log(`[audiocap][mac] Copied binary to ${outDir}`);
}

function buildWinAudioCap() {
  const projectDir = path.join(ROOT, 'wasapi-audiocap');
  const projectFile = path.join(projectDir, 'audiocap.csproj');
  if (!existsSync(projectFile)) {
    console.log('[audiocap][win] Skip: project not found');
    return;
  }
  try {
    execFileSync('dotnet', ['--version'], { stdio: 'pipe' });
  } catch (_) {
    console.warn('[audiocap][win] dotnet SDK not found, skipping');
    return;
  }
  const outDir = path.join(ROOT, 'audiocap-bin', 'win');
  console.log('[audiocap][win] Building WASAPI helper...');
  execFileSync(
    'dotnet',
    [
      'publish',
      '-c',
      'Release',
      '-r',
      'win-x64',
      '--self-contained',
      '-p:PublishSingleFile=true',
      '-p:PublishTrimmed=true',
      '-p:IncludeNativeLibrariesForSelfExtract=true',
    ],
    { stdio: 'inherit', cwd: projectDir }
  );
  const builtExe = path.join(
    projectDir,
    'bin',
    'Release',
    'net8.0',
    'win-x64',
    'publish',
    'audiocap.exe'
  );
  if (!existsSync(builtExe)) {
    throw new Error('[audiocap][win] Build succeeded but audiocap.exe not found');
  }
  mkdirSync(outDir, { recursive: true });
  cpSync(builtExe, path.join(outDir, 'audiocap.exe'));
  console.log(`[audiocap][win] Copied binary to ${outDir}`);
}

buildMacAudioCap();
buildWinAudioCap();
