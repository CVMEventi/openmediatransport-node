/**
 * Loopback example — sender and receiver in the same process.
 *
 * Useful for verifying the library works without any external equipment.
 * The sender broadcasts colour bars and a sine wave; the receiver connects
 * locally and logs what arrives.
 *
 * Run:  node examples/loopback.js
 */

import { Sender, Receiver, FrameType, Codec, ColorSpace, Quality, PreferredVideoFormat } from '..';

// ── Sender setup ──────────────────────────────────────────────────────────────

const tx = new Sender('Loopback Test', Quality.High);
tx.setSenderInformation({ productName: 'omt-node', manufacturer: 'Example', version: '1.0' });
tx.addConnectionMetadata('<omtmeta><source>loopback</source></omtmeta>');

const senderAddress = tx.address;
console.log(`Sender advertising as: ${senderAddress}\n`);

// ── Frame generators ──────────────────────────────────────────────────────────

const W = 1280, H = 720, FPS = 30;
const stride = W * 2;

// Solid colour UYVY frame that slowly shifts hue each call
let hueOffset = 0;

function makeVideoFrame() {
  const buf = Buffer.alloc(stride * H);
  // Simplified: fill with a cycling Y value so the frame visibly changes
  const Y  = 100 + Math.round(50 * Math.sin(hueOffset));
  const UV = 128;
  hueOffset += 0.05;
  for (let i = 0; i < buf.length; i += 4) {
    buf[i]     = UV; // U
    buf[i + 1] = Y;  // Y0
    buf[i + 2] = UV; // V
    buf[i + 3] = Y;  // Y1
  }
  return buf;
}

const SAMPLE_RATE = 48000, CHANNELS = 2, SPF = 480;
let audioPhase = 0;
const phaseInc = (2 * Math.PI * 440) / SAMPLE_RATE; // 440 Hz tone

function makeAudioFrame() {
  const buf  = Buffer.alloc(CHANNELS * SPF * 4);
  const view = new Float32Array(buf.buffer, buf.byteOffset);
  for (let i = 0; i < SPF; i++) {
    const s = 0.2 * Math.sin(audioPhase);
    audioPhase = (audioPhase + phaseInc) % (2 * Math.PI);
    for (let ch = 0; ch < CHANNELS; ch++) view[ch * SPF + i] = s;
  }
  return buf;
}

// ── Start sending ─────────────────────────────────────────────────────────────

let framesSent = 0;
let running = true;

const sendInterval = setInterval(() => {
  if (!running) return;

  // Send one video frame
  tx.send({
    type:       FrameType.Video,
    timestamp:  -1n,
    codec:      Codec.UYVY,
    width:      W,
    height:     H,
    stride,
    frameRateN: FPS,
    frameRateD: 1,
    colorSpace: ColorSpace.BT709,
    data:       makeVideoFrame(),
  });

  // Send one audio frame
  tx.send({
    type:             FrameType.Audio,
    timestamp:        -1n,
    codec:            Codec.FPA1,
    sampleRate:       SAMPLE_RATE,
    channels:         CHANNELS,
    samplesPerChannel: SPF,
    data:             makeAudioFrame(),
  });

  // Send a metadata frame every 30 video frames (~1 s)
  if (++framesSent % FPS === 0) {
    tx.send({
      type:          FrameType.Metadata,
      timestamp:     -1n,
      frameMetadata: `<status><frame>${framesSent}</frame><time>${Date.now()}</time></status>`,
    });
  }
}, 1000 / FPS);

// ── Give the sender a moment to start advertising, then connect ───────────────

await new Promise(r => setTimeout(r, 200));

// ── Receiver setup ────────────────────────────────────────────────────────────

console.log(`Connecting receiver to: ${senderAddress}`);
const rx = new Receiver(senderAddress, FrameType.Video | FrameType.Audio | FrameType.Metadata, PreferredVideoFormat.UYVY);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

const MAX_FRAMES = 100;
let videoReceived = 0, audioReceived = 0, metaReceived = 0;

process.on('SIGINT', () => { running = false; });

// ── Receive loop — stop after MAX_FRAMES video frames or Ctrl+C ───────────────

console.log(`Receiving up to ${MAX_FRAMES} video frames...\n`);

while (running && videoReceived < MAX_FRAMES) {
  const frame = await rx.receive(2000);
  if (!frame) continue;

  switch (frame.type) {
    case FrameType.Video: {
      videoReceived++;
      if (videoReceived % FPS === 1) {
        console.log(
          `[video #${videoReceived}]  ${frame.width}x${frame.height}` +
          `  codec=${Object.entries(Codec).find(([, v]) => v === frame.codec)?.[0]}` +
          `  data=${frame.data?.byteLength ?? 0} B`,
        );
      }
      break;
    }
    case FrameType.Audio: {
      audioReceived++;
      if (audioReceived === 1) {
        console.log(
          `[audio first]  ${frame.channels} ch  ${frame.sampleRate} Hz` +
          `  ${frame.samplesPerChannel} samples/ch  ${frame.data?.byteLength ?? 0} B`,
        );
      }
      break;
    }
    case FrameType.Metadata: {
      metaReceived++;
      console.log(`[metadata #${metaReceived}]  ${frame.frameMetadata}`);
      break;
    }
  }
}

// ── Results ───────────────────────────────────────────────────────────────────

clearInterval(sendInterval);
running = false;

const vStats = tx.getVideoStatistics();
const aStats = tx.getAudioStatistics();

console.log('\n── Summary ──────────────────────────────');
console.log(`Sent:     ${vStats.frames} video frames, ${aStats.frames} audio frames`);
console.log(`Received: ${videoReceived} video, ${audioReceived} audio, ${metaReceived} metadata`);
console.log(`Dropped:  ${vStats.framesDropped} video, ${aStats.framesDropped} audio`);

rx.destroy();
tx.destroy();
