#!/bin/bash
cd "$(dirname "$0")"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Building Silero VAD bundle..."
npm run build:vad --silent

if [ "$(uname -s)" = "Darwin" ]; then
  if [ ! -x "audiocap-bin/mac/audiocap" ]; then
    echo "Building ScreenCaptureKit audiocap helper..."
    npm run setup:audiocap --silent
  fi
fi

echo "Starting LazyScreen Recorder..."
./node_modules/.bin/electron .
