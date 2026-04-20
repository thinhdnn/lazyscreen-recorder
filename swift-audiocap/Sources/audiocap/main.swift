import Foundation

var sampleRate = 16_000
var channels = 1

var args = CommandLine.arguments.dropFirst()
while let arg = args.first {
  args = args.dropFirst()
  switch arg {
  case "--sample-rate":
    if let value = args.first, let parsed = Int(value) {
      sampleRate = parsed
      args = args.dropFirst()
    }
  case "--channels":
    if let value = args.first, let parsed = Int(value) {
      channels = parsed
      args = args.dropFirst()
    }
  case "--version":
    print("audiocap 1.0.0")
    exit(0)
  case "--help", "-h":
    print("""
    Usage: audiocap [options]

    Capture system audio via ScreenCaptureKit and output raw PCM to stdout.

    Options:
      --sample-rate  Output sample rate in Hz (default: 16000)
      --channels     Output channel count (default: 1)
      --version      Print version and exit
      --help, -h     Show this help

    Output format: PCM signed 16-bit little-endian (s16le)
    Requires: macOS 13.0+, Screen Recording permission
    """)
    exit(0)
  default:
    FileHandle.standardError.write("Unknown argument: \(arg)\n".data(using: .utf8)!)
    exit(1)
  }
}

guard #available(macOS 13.0, *) else {
  FileHandle.standardError.write(
    "Error: audiocap requires macOS 13.0 or later\n".data(using: .utf8)!
  )
  exit(1)
}

let capture = AudioCapture(sampleRate: sampleRate, channels: channels)

let stopAndExit: @convention(c) (Int32) -> Void = { _ in
  capture.stop()
  exit(0)
}

signal(SIGTERM, stopAndExit)
signal(SIGINT, stopAndExit)

capture.start()
RunLoop.current.run()
