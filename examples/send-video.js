/**
 * Send video example — broadcast a SMPTE colour-bar test pattern at 60 fps.
 *
 * The frame buffer is generated once and reused each iteration.
 * Passing timestamp=-1n tells the library to generate timestamps and pace
 * delivery to maintain the specified frame rate automatically.
 *
 * Run:  node examples/send-video.js
 *  or:  node examples/send-video.js "My Source" 1920 1080 60
 */

import { Sender, FrameType, Codec, ColorSpace, Quality } from '../index.js';

// ── Configuration ─────────────────────────────────────────────────────────────

const name   = process.argv[2] ?? 'Node Test Pattern';
const width  = parseInt(process.argv[3] ?? '1920', 10);
const height = parseInt(process.argv[4] ?? '1080', 10);
const fps    = parseInt(process.argv[5] ?? '60',   10);

// ── Colour bars frame buffer (UYVY) ──────────────────────────────────────────
//
// UYVY packs 2 pixels into 4 bytes: [ U, Y0, V, Y1 ]
//
// Standard SMPTE 7-bar colours expressed as (Y, Cb, Cr):
const BARS = [
  [235, 128, 128], // white
  [210,  16, 146], // yellow
  [169, 166,  16], // cyan
  [144,  54,  34], // green
  [106, 202, 222], // magenta
  [ 81,  90, 240], // red
  [ 40, 240, 110], // blue
];

function makeColorBarsUYVY(w, h) {
  const stride = w * 2; // 2 bytes per pixel
  const buf    = Buffer.alloc(stride * h);
  const barW   = Math.floor(w / BARS.length);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const [Y, U, V] = BARS[Math.min(Math.floor(x / barW), BARS.length - 1)];
      const off = y * stride + x * 2;
      buf[off]     = U;
      buf[off + 1] = Y;
      buf[off + 2] = V;
      buf[off + 3] = Y;
    }
  }
  return { buf, stride };
}

console.log(`Generating ${width}x${height} colour bars...`);
const { buf: pixelData, stride } = makeColorBarsUYVY(width, height);
console.log(`Frame buffer: ${pixelData.byteLength} bytes\n`);

// ── Create sender ─────────────────────────────────────────────────────────────

const tx = new Sender(name, Quality.High);
console.log(`Sending as: ${tx.address}`);
console.log(`Press Ctrl+C to stop.\n`);

// ── Frame template (all constant fields set once) ────────────────────────────

const frame = {
  type:       FrameType.Video,
  timestamp:  -1n,     // library generates timestamps and paces to frameRateN/D
  codec:      Codec.UYVY,
  width,
  height,
  stride,
  frameRateN: fps,
  frameRateD: 1,
  aspectRatio: width / height,
  colorSpace: height < 720 ? ColorSpace.BT601 : ColorSpace.BT709,
  data:       pixelData,
};

// ── Graceful shutdown ─────────────────────────────────────────────────────────

let running = true;
process.on('SIGINT', () => {
  console.log('\nStopping...');
  running = false;
});

// ── Send loop ─────────────────────────────────────────────────────────────────

let frameCount = 0;
const logEvery = fps * 5; // log every 5 seconds worth of frames

while (running) {
  tx.send(frame);
  frameCount++;

  if (frameCount % logEvery === 0) {
    const stats = tx.getVideoStatistics();
    console.log(
      `[frame ${frameCount}]  connections: ${tx.connections}` +
      `  dropped: ${stats.framesDropped}` +
      `  codec ms/frame: ${Number(stats.codecTimeSinceLast)}`,
    );
  }

  // When timestamp is -1n the library paces us, but we still yield to the
  // event loop so the process stays responsive to signals and async work.
  await new Promise(r => setImmediate(r));
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

const stats = tx.getVideoStatistics();
console.log(`\nSent ${stats.frames} frames  (${stats.framesDropped} dropped)`);
tx.destroy();
