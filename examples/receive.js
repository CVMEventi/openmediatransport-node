/**
 * Receive example — connect to the first available source and log each incoming frame.
 *
 * Run:  node examples/receive.js
 *  or:  node examples/receive.js "HOSTNAME (Source Name)"
 *  or:  node examples/receive.js omt://192.168.1.10:6400
 */

import { Receiver, FrameType, Codec, getAddresses, PreferredVideoFormat, ReceiveFlags } from '..';

// ── Resolve address ───────────────────────────────────────────────────────────

let address = process.argv[2];

if (!address) {
  const sources = getAddresses();
  if (sources.length === 0) {
    console.error('No sources found on the network. Pass an address as an argument or start an OMT sender.');
    process.exit(1);
  }
  address = sources[0];
  console.log(`Auto-selected: ${address}\n`);
}

// ── Connect ───────────────────────────────────────────────────────────────────

const rx = new Receiver(
  address,
  FrameType.Video | FrameType.Audio | FrameType.Metadata,
  PreferredVideoFormat.UYVY,
  ReceiveFlags.None,
);

console.log(`Receiving from: ${address}`);
console.log('Press Ctrl+C to stop.\n');

// ── Graceful shutdown ─────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\nDisconnecting...');
  rx.destroy();

  const vstats = rx.getVideoStatistics?.() ?? null;  // guard — only valid before destroy in real usage
  process.exit(0);
});

// ── Codec name lookup ─────────────────────────────────────────────────────────

function codecName(value) {
  const entry = Object.entries(Codec).find(([, v]) => v === value);
  return entry ? entry[0] : `0x${value.toString(16).toUpperCase()}`;
}

// ── Receive loop ──────────────────────────────────────────────────────────────

let videoFrames = 0;
let audioFrames = 0;

// Print a stats summary every 5 seconds
const statInterval = setInterval(() => {
  const vStats = rx.getVideoStatistics();
  console.log(
    `[stats] video frames received: ${vStats.frames}  dropped: ${vStats.framesDropped}` +
    `  bitrate: ${Number(vStats.bytesSentSinceLast) * 8 / 1000 / 5 | 0} kbps`,
  );
}, 5000);

while (true) {
  const frame = await rx.receive(2000);

  if (!frame) {
    console.log('[timeout] No frame received within 2 s — still waiting...');
    continue;
  }

  switch (frame.type) {
    case FrameType.Video:
      videoFrames++;
      if (videoFrames % 60 === 1) {
        // Log every 60th frame to avoid flooding the console
        console.log(
          `[video] ${frame.width}x${frame.height}  ` +
          `codec=${codecName(frame.codec)}  ` +
          `${frame.frameRateN}/${frame.frameRateD} fps  ` +
          `stride=${frame.stride}  ` +
          `data=${frame.data?.byteLength ?? 0} B`,
        );
      }
      break;

    case FrameType.Audio:
      audioFrames++;
      if (audioFrames % 100 === 1) {
        console.log(
          `[audio] ${frame.channels} ch  ` +
          `${frame.sampleRate} Hz  ` +
          `${frame.samplesPerChannel} samples/ch  ` +
          `data=${frame.data?.byteLength ?? 0} B`,
        );
      }
      break;

    case FrameType.Metadata:
      console.log('[metadata]', frame.frameMetadata?.slice(0, 120));
      break;
  }
}
