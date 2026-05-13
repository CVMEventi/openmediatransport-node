/**
 * Send audio example — broadcast a stereo 1 kHz sine wave at 48 kHz.
 *
 * Audio frames use the FPA1 codec: 32-bit float, planar layout.
 * "Planar" means all samples for channel 0 come first, then channel 1, etc.
 *
 * Buffer layout for 2 channels, N samples per channel:
 *   [ ch0[0], ch0[1], …, ch0[N-1], ch1[0], ch1[1], …, ch1[N-1] ]
 *
 * Passing timestamp=-1n tells the library to pace delivery to sampleRate automatically.
 *
 * Run:  node examples/send-audio.js
 *  or:  node examples/send-audio.js "My Source" 48000 2 480 1000
 */

import { Sender, FrameType, Codec, Quality } from '..';

// ── Configuration ─────────────────────────────────────────────────────────────

const name             = process.argv[2] ?? 'Node Audio Test';
const sampleRate       = parseInt(process.argv[3] ?? '48000', 10);
const channels         = parseInt(process.argv[4] ?? '2',     10);
const samplesPerChannel = parseInt(process.argv[5] ?? '480',   10); // 480 @ 48 kHz = 10 ms frames
const frequency        = parseFloat(process.argv[6] ?? '1000');     // Hz

// ── Sine wave generator ───────────────────────────────────────────────────────
//
// Phase is tracked across frames so the wave is continuous (no click between frames).

let phase = 0;
const phaseIncrement = (2 * Math.PI * frequency) / sampleRate;

function makeSineFrame() {
  const buf  = Buffer.alloc(channels * samplesPerChannel * 4);
  const view = new Float32Array(buf.buffer, buf.byteOffset, channels * samplesPerChannel);

  for (let i = 0; i < samplesPerChannel; i++) {
    const sample = 0.3 * Math.sin(phase); // 0.3 amplitude → –10 dBFS
    phase = (phase + phaseIncrement) % (2 * Math.PI);

    for (let ch = 0; ch < channels; ch++) {
      view[ch * samplesPerChannel + i] = sample;
    }
  }

  return buf;
}

// ── Create sender ─────────────────────────────────────────────────────────────

const tx = new Sender(name, Quality.Default);
console.log(`Sending as: ${tx.address}`);
console.log(`${channels} ch  ${sampleRate} Hz  ${samplesPerChannel} samples/frame  ${frequency} Hz tone`);
console.log('Press Ctrl+C to stop.\n');

// ── Frame template ────────────────────────────────────────────────────────────

const frameBase = {
  type:             FrameType.Audio,
  timestamp:        -1n,
  codec:            Codec.FPA1,
  sampleRate,
  channels,
  samplesPerChannel,
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────

let running = true;
process.on('SIGINT', () => {
  console.log('\nStopping...');
  running = false;
});

// ── Send loop ─────────────────────────────────────────────────────────────────

let frameCount = 0;
const logEvery = Math.round(sampleRate / samplesPerChannel) * 5; // every ~5 seconds

while (running) {
  const data = makeSineFrame();
  tx.send({ ...frameBase, data });
  frameCount++;

  if (frameCount % logEvery === 0) {
    const stats = tx.getAudioStatistics();
    console.log(
      `[frame ${frameCount}]  connections: ${tx.connections}` +
      `  sent: ${Number(stats.frames)} frames`,
    );
  }

  await new Promise(r => setImmediate(r));
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

const stats = tx.getAudioStatistics();
console.log(`\nSent ${stats.frames} audio frames`);
tx.destroy();
