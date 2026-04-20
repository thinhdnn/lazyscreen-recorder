import Foundation
import ScreenCaptureKit
import CoreMedia
import AVFoundation

@available(macOS 13.0, *)
final class AudioCapture: NSObject, SCStreamDelegate, SCStreamOutput {
  private var stream: SCStream?
  private let sampleRate: Int
  private let channels: Int
  private let stdout = FileHandle.standardOutput
  private let stderr = FileHandle.standardError

  private var converter: AVAudioConverter?
  private var inputFormat: AVAudioFormat?
  private var outputFormat: AVAudioFormat?

  init(sampleRate: Int, channels: Int) {
    self.sampleRate = sampleRate
    self.channels = channels
    super.init()
  }

  func start() {
    SCShareableContent.getExcludingDesktopWindows(
      false,
      onScreenWindowsOnly: false
    ) { [weak self] content, error in
      guard let self = self else { return }
      if let error = error {
        self.writeStderr("Error: \(error.localizedDescription)\n")
        exit(1)
      }
      guard let content = content, let display = content.displays.first else {
        self.writeStderr("Error: No display found\n")
        exit(1)
      }

      let cfg = SCStreamConfiguration()
      cfg.capturesAudio = true
      cfg.sampleRate = self.sampleRate
      cfg.channelCount = self.channels
      cfg.excludesCurrentProcessAudio = true
      cfg.width = 2
      cfg.height = 2
      cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)

      let filter = SCContentFilter(
        display: display,
        excludingApplications: [],
        exceptingWindows: []
      )

      do {
        let stream = SCStream(filter: filter, configuration: cfg, delegate: self)
        try stream.addStreamOutput(
          self,
          type: .audio,
          sampleHandlerQueue: .global(qos: .userInteractive)
        )
        stream.startCapture { err in
          if let err = err {
            self.writeStderr("Error: Failed to start capture: \(err.localizedDescription)\n")
            exit(1)
          }
        }
        self.stream = stream
      } catch {
        self.writeStderr("Error: Failed to create stream: \(error.localizedDescription)\n")
        exit(1)
      }
    }
  }

  func stop() {
    stream?.stopCapture { _ in }
    stream = nil
  }

  func stream(
    _ stream: SCStream,
    didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
    of type: SCStreamOutputType
  ) {
    guard type == .audio, sampleBuffer.isValid else { return }
    guard let formatDesc = sampleBuffer.formatDescription,
      let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(formatDesc)?.pointee
    else {
      return
    }

    if converter == nil {
      let srcRate = asbd.mSampleRate
      let srcCh = asbd.mChannelsPerFrame
      inputFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: srcRate,
        channels: AVAudioChannelCount(srcCh),
        interleaved: false
      )
      outputFormat = AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: Double(sampleRate),
        channels: AVAudioChannelCount(channels),
        interleaved: false
      )
      if let i = inputFormat, let o = outputFormat,
        i.sampleRate != o.sampleRate || i.channelCount != o.channelCount
      {
        converter = AVAudioConverter(from: i, to: o)
      }
    }

    guard let blockBuffer = sampleBuffer.dataBuffer else { return }
    let length = CMBlockBufferGetDataLength(blockBuffer)
    var data = Data(count: length)
    data.withUnsafeMutableBytes { rawBuf in
      guard let ptr = rawBuf.baseAddress else { return }
      CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0, dataLength: length, destination: ptr)
    }
    let frameCount = sampleBuffer.numSamples
    guard frameCount > 0 else { return }

    let srcChannelCount = Int(asbd.mChannelsPerFrame)
    let isInterleaved = asbd.mFormatFlags & kAudioFormatFlagIsNonInterleaved == 0
    var floatSamples: [[Float]]
    if isInterleaved {
      let totalSamples = length / MemoryLayout<Float>.size
      let all = data.withUnsafeBytes { buf -> [Float] in
        let fb = buf.bindMemory(to: Float.self)
        return Array(fb.prefix(totalSamples))
      }
      floatSamples = (0..<srcChannelCount).map { ch in
        stride(from: ch, to: totalSamples, by: srcChannelCount).map { all[$0] }
      }
    } else {
      let samplesPerChannel = frameCount
      floatSamples = []
      let fSize = MemoryLayout<Float>.size
      for ch in 0..<srcChannelCount {
        let offset = ch * samplesPerChannel * fSize
        let channelData = data.withUnsafeBytes { buf -> [Float] in
          let start = buf.baseAddress!.advanced(by: offset)
          let fb = start.assumingMemoryBound(to: Float.self)
          return Array(UnsafeBufferPointer(start: fb, count: samplesPerChannel))
        }
        floatSamples.append(channelData)
      }
    }

    let out: [Float]
    if let converter = converter, let inFmt = inputFormat, let outFmt = outputFormat {
      guard let inBuf = AVAudioPCMBuffer(
        pcmFormat: inFmt,
        frameCapacity: AVAudioFrameCount(frameCount)
      ) else { return }
      inBuf.frameLength = AVAudioFrameCount(frameCount)
      for ch in 0..<min(srcChannelCount, Int(inFmt.channelCount)) {
        let dst = inBuf.floatChannelData![ch]
        for i in 0..<frameCount { dst[i] = floatSamples[ch][i] }
      }

      let ratio = outFmt.sampleRate / inFmt.sampleRate
      let outFrames = AVAudioFrameCount(ceil(Double(frameCount) * ratio))
      guard let outBuf = AVAudioPCMBuffer(pcmFormat: outFmt, frameCapacity: outFrames) else {
        return
      }
      var err: NSError?
      var consumed = false
      converter.convert(to: outBuf, error: &err) { _, outStatus in
        if consumed {
          outStatus.pointee = .noDataNow
          return nil
        }
        consumed = true
        outStatus.pointee = .haveData
        return inBuf
      }
      if err != nil { return }
      let count = Int(outBuf.frameLength)
      let outCh = Int(outFmt.channelCount)
      if outCh == 1 {
        out = Array(UnsafeBufferPointer(start: outBuf.floatChannelData![0], count: count))
      } else {
        var mixed = [Float](repeating: 0, count: count)
        for ch in 0..<outCh {
          let chData = outBuf.floatChannelData![ch]
          for i in 0..<count { mixed[i] += chData[i] }
        }
        let scale = 1.0 / Float(outCh)
        for i in 0..<count { mixed[i] *= scale }
        out = mixed
      }
    } else {
      let numSamples = floatSamples[0].count
      if channels == 1 && srcChannelCount > 1 {
        var mixed = [Float](repeating: 0, count: numSamples)
        for ch in 0..<srcChannelCount {
          for i in 0..<numSamples { mixed[i] += floatSamples[ch][i] }
        }
        let scale = 1.0 / Float(srcChannelCount)
        for i in 0..<numSamples { mixed[i] *= scale }
        out = mixed
      } else {
        out = floatSamples[0]
      }
    }

    var pcm = Data(capacity: out.count * 2)
    for sample in out {
      let clamped = max(-1.0, min(1.0, sample))
      let int16Val = Int16(clamped * 32767.0)
      var le = int16Val.littleEndian
      pcm.append(Data(bytes: &le, count: 2))
    }
    stdout.write(pcm)
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    writeStderr("Stream stopped with error: \(error.localizedDescription)\n")
    exit(1)
  }

  private func writeStderr(_ message: String) {
    if let data = message.data(using: .utf8) {
      stderr.write(data)
    }
  }
}
