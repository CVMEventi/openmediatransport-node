/// <reference types="node" />

// ============================================================
// Enums
// ============================================================

export declare const FrameType: {
  readonly None: 0;
  readonly Metadata: 1;
  readonly Video: 2;
  readonly Audio: 4;
};
export type FrameTypeValue = typeof FrameType[keyof typeof FrameType];

export declare const Codec: {
  readonly VMX1: number; // Fast compressed video codec
  readonly FPA1: number; // 32-bit floating-point planar audio
  readonly UYVY: number; // 16bpp YUV 4:2:2
  readonly YUY2: number; // 16bpp YUV 4:2:2, YUYV pixel order
  readonly BGRA: number; // 32bpp RGBA
  readonly NV12: number; // Planar 4:2:0, Y + interleaved UV
  readonly YV12: number; // Planar 4:2:0, Y + U + V
  readonly UYVA: number; // UYVY with alpha plane
  readonly P216: number; // Planar 4:2:2, 16-bit Y + interleaved 16-bit UV
  readonly PA16: number; // P216 with additional 16-bit alpha plane
};
export type CodecValue = typeof Codec[keyof typeof Codec];

export declare const Quality: {
  /** Let receivers negotiate the highest quality they all support. */
  readonly Default: 0;
  readonly Low: 1;
  readonly Medium: 50;
  readonly High: 100;
};
export type QualityValue = typeof Quality[keyof typeof Quality];

export declare const ColorSpace: {
  /** Auto-detect: BT.601 for heights < 720, BT.709 otherwise. */
  readonly Undefined: 0;
  readonly BT601: 601;
  readonly BT709: 709;
};
export type ColorSpaceValue = typeof ColorSpace[keyof typeof ColorSpace];

export declare const VideoFlags: {
  readonly None: 0;
  readonly Interlaced: 1;
  /** Frame contains a valid alpha channel. */
  readonly Alpha: 2;
  /** Alpha is pre-multiplied (requires Alpha flag). */
  readonly PreMultiplied: 4;
  /** 1/8th-size preview frame. */
  readonly Preview: 8;
  /** P216 or PA16 source data (set automatically by the sender for those formats). */
  readonly HighBitDepth: 16;
};
export type VideoFlagsValue = typeof VideoFlags[keyof typeof VideoFlags];

export declare const PreferredVideoFormat: {
  /** Always decode to UYVY (fastest). */
  readonly UYVY: 0;
  /** BGRA only when an alpha channel is present, otherwise UYVY. */
  readonly UYVYorBGRA: 1;
  /** Always decode to BGRA. */
  readonly BGRA: 2;
  /** UYVA only when alpha is present, otherwise UYVY. */
  readonly UYVYorUYVA: 3;
  /** P216/PA16 for high-bit-depth sources, UYVA/UYVY otherwise. */
  readonly UYVYorUYVAorP216orPA16: 4;
  readonly P216: 5;
};
export type PreferredVideoFormatValue = typeof PreferredVideoFormat[keyof typeof PreferredVideoFormat];

export declare const ReceiveFlags: {
  readonly None: 0;
  /** Receive 1/8th-size preview frames only. */
  readonly Preview: 1;
  /** Also include the original compressed VMX1 frame in compressedData. */
  readonly IncludeCompressed: 2;
  /** Only deliver compressed VMX1 data; decoded data will be empty. */
  readonly CompressedOnly: 4;
};
export type ReceiveFlagsValue = typeof ReceiveFlags[keyof typeof ReceiveFlags];

// ============================================================
// Shared data structures
// ============================================================

export interface Tally {
  /** 0 = off, 1 = on. */
  preview: number;
  /** 0 = off, 1 = on. */
  program: number;
}

export interface TallyResult {
  /** 1 if tally changed, 0 if timed out or unchanged. */
  changed: number;
  tally: Tally;
}

export interface SenderInfo {
  productName: string;
  manufacturer: string;
  version: string;
}

export interface Statistics {
  bytesSent: bigint;
  bytesReceived: bigint;
  bytesSentSinceLast: bigint;
  bytesReceivedSinceLast: bigint;
  frames: bigint;
  framesSinceLast: bigint;
  framesDropped: bigint;
  /** Total milliseconds spent encoding across all frames. Divide by frames for per-frame time. */
  codecTime: bigint;
  /** Milliseconds spent encoding the most recent frame. */
  codecTimeSinceLast: bigint;
}

/**
 * Represents a media frame for sending or receiving.
 *
 * Always zero-initialise before filling in fields:
 * the underlying C library requires unused fields to be 0.
 *
 * ### Video frame (sending)
 * ```js
 * {
 *   type:       FrameType.Video,
 *   timestamp:  -1n,            // -1n = let the library generate timestamps
 *   codec:      Codec.UYVY,
 *   width:      1920,
 *   height:     1080,
 *   stride:     1920 * 2,       // width * 2 for UYVY
 *   frameRateN: 60, frameRateD: 1,
 *   colorSpace: ColorSpace.BT709,
 *   data:       Buffer,         // raw pixel data
 * }
 * ```
 *
 * ### Audio frame (sending)
 * ```js
 * {
 *   type:             FrameType.Audio,
 *   timestamp:        -1n,
 *   codec:            Codec.FPA1,      // only supported audio codec
 *   sampleRate:       48000,
 *   channels:         2,
 *   samplesPerChannel: 480,
 *   data:             Buffer,          // planar float32 audio: channels × samplesPerChannel × 4 bytes
 * }
 * ```
 *
 * ### Metadata frame (sending)
 * ```js
 * {
 *   type:         FrameType.Metadata,
 *   timestamp:    -1n,
 *   frameMetadata: '<meta>...</meta>', // UTF-8 XML string
 * }
 * ```
 */
export interface MediaFrame {
  /** FrameType — determines which other fields are relevant. */
  type: FrameTypeValue;

  /**
   * Presentation timestamp where 1 second = 10,000,000 units.
   * Pass `-1n` to let the library generate timestamps and throttle to the
   * specified frame rate or sample rate automatically.
   */
  timestamp?: bigint;

  /**
   * Pixel or audio format.
   *
   * **Sending video:** UYVY, YUY2, NV12, YV12, BGRA, UYVA, VMX1
   *
   * **Sending audio:** FPA1 only (32-bit floating-point planar)
   *
   * **Receiving:** populated by the library; UYVY, UYVA, BGRA, or BGRX depending
   * on the PreferredVideoFormat set in the Receiver constructor.
   */
  codec?: CodecValue;

  // ── Video ────────────────────────────────────────────────
  width?: number;
  height?: number;
  /** Row stride in bytes. Typically width×2 for UYVY, width×4 for BGRA, width for planar formats. */
  stride?: number;
  /** Bitmask of VideoFlags values. */
  flags?: number;
  /** Frame rate numerator. e.g. 60 for 60 fps. */
  frameRateN?: number;
  /** Frame rate denominator. e.g. 1 for 60 fps, 1001 for 59.94 fps. */
  frameRateD?: number;
  /** Display aspect ratio as width/height, e.g. 1.7778 for 16:9. */
  aspectRatio?: number;
  colorSpace?: ColorSpaceValue;

  // ── Audio ────────────────────────────────────────────────
  /** Sample rate in Hz, e.g. 48000 or 44100. */
  sampleRate?: number;
  /** Number of audio channels. Maximum 32. */
  channels?: number;
  /** 32-bit float samples per channel per frame. Each plane = samplesPerChannel × 4 bytes. */
  samplesPerChannel?: number;

  // ── Payload ──────────────────────────────────────────────
  /**
   * Raw frame payload.
   *
   * - **Video:** uncompressed pixel data (or pre-compressed VMX1 data when codec is VMX1)
   * - **Audio:** planar float32 — total size = channels × samplesPerChannel × 4 bytes
   * - **Metadata:** not used; put XML in frameMetadata instead
   */
  data?: Buffer | null;

  /**
   * Receive-only. Present when ReceiveFlags.IncludeCompressed or CompressedOnly is set.
   * Contains the original VMX1-compressed frame suitable for muxing into AVI/MOV.
   */
  compressedData?: Buffer | null;

  /** Per-frame metadata as a UTF-8 XML string. Up to 65 536 bytes. */
  frameMetadata?: string | null;
}

// ============================================================
// Receiver
// ============================================================

export declare class Receiver {
  /**
   * Create a new receiver and begin connecting to the given sender.
   *
   * @param address - Full discovery name (e.g. `"HOSTNAME (Source Name)"`)
   *                  or a URL in the form `omt://hostname:port`
   * @param frameTypes - Bitmask of FrameType values to receive.
   *                     Defaults to Video | Audio | Metadata.
   * @param format - Preferred uncompressed output format for decoded video.
   *                 Defaults to PreferredVideoFormat.UYVY (fastest).
   * @param flags - ReceiveFlags bitmask. Defaults to None.
   *
   * @throws if the library fails to create the receiver instance.
   *
   * @example
   * const rx = new Receiver('STUDIO-PC (Camera 1)');
   * const rx = new Receiver('omt://192.168.1.10:6400', FrameType.Video, PreferredVideoFormat.BGRA);
   */
  constructor(
    address: string,
    frameTypes?: number,
    format?: PreferredVideoFormatValue,
    flags?: ReceiveFlagsValue,
  );

  /** Disconnect and free all resources. Safe to call multiple times. */
  destroy(): void;

  /** Supports the `using` keyword (TC39 explicit resource management). */
  [Symbol.dispose](): void;

  /**
   * Wait for the next incoming frame.
   *
   * Resolves with a MediaFrame, or `null` if the timeout expires before a frame arrives.
   * The returned Buffers are independent copies — safe to keep across calls.
   *
   * @param timeoutMs - Maximum time to wait in milliseconds. Default 1000.
   * @param frameTypes - Frame types to accept. Defaults to all types.
   *
   * @example
   * while (true) {
   *   const frame = await rx.receive(500);
   *   if (!frame) continue;
   *   if (frame.type === FrameType.Video) processVideo(frame);
   * }
   */
  receive(timeoutMs?: number, frameTypes?: number): Promise<MediaFrame | null>;

  /**
   * Send a metadata frame back to the sender. Only FrameType.Metadata is supported.
   * @returns 1 on success, 0 on failure.
   */
  sendMetadata(frame: Pick<MediaFrame, 'frameMetadata' | 'timestamp'>): number;

  /**
   * Report this receiver's tally state to the sender.
   * @param tally - preview and program tally (0 = off, 1 = on)
   */
  setTally(tally: Tally): void;

  /**
   * Wait for a tally change from the sender.
   * Returns immediately with the last known state if the timeout expires.
   */
  getTally(timeoutMs?: number): Promise<TallyResult>;

  /**
   * Dynamically change receive flags without recreating the receiver.
   * Applies from the next received frame.
   */
  setFlags(flags: ReceiveFlagsValue): void;

  /**
   * Inform the sender of this receiver's preferred encoding quality.
   * The sender picks the highest quality suggested among all its receivers.
   */
  setSuggestedQuality(quality: QualityValue): void;

  /** Returns sender product information, or empty strings when disconnected. */
  getSenderInformation(): SenderInfo;

  getVideoStatistics(): Statistics;
  getAudioStatistics(): Statistics;
}

// ============================================================
// Sender
// ============================================================

export declare class Sender {
  /**
   * Create a new sender and begin advertising on the network.
   *
   * @param name - Source name without the hostname, e.g. `"Camera 1"`.
   *               Appears in discovery as `"HOSTNAME (Camera 1)"`.
   * @param quality - Encoding quality. If Default, receivers can negotiate upward.
   *
   * @throws if the library fails to create the sender instance.
   *
   * @example
   * const tx = new Sender('Camera 1');
   * const tx = new Sender('Playout', Quality.High);
   */
  constructor(name: string, quality?: QualityValue);

  /** Shut down and release resources. Safe to call multiple times. */
  destroy(): void;

  /** Supports the `using` keyword (TC39 explicit resource management). */
  [Symbol.dispose](): void;

  /** Discovery address in `"HOSTNAME (name)"` format. */
  get address(): string;

  /**
   * Current number of active TCP connections.
   * Each receiver establishes one connection for video/metadata and one for audio,
   * so a single receiver typically counts as 2.
   */
  get connections(): number;

  /**
   * Send a frame to all connected receivers.
   *
   * **Video frame** — must set type, codec, width, height, stride, frameRateN,
   * frameRateD, and data.
   *
   * **Audio frame** — must set type, codec (FPA1), sampleRate, channels,
   * samplesPerChannel, and data.
   *
   * **Metadata frame** — must set type and frameMetadata.
   *
   * @returns 1 on success, 0 if no receivers are connected or on error.
   *
   * @example
   * // Send a UYVY video frame at 60 fps
   * tx.send({
   *   type:       FrameType.Video,
   *   timestamp:  -1n,
   *   codec:      Codec.UYVY,
   *   width:      1920,
   *   height:     1080,
   *   stride:     1920 * 2,
   *   frameRateN: 60,
   *   frameRateD: 1,
   *   colorSpace: ColorSpace.BT709,
   *   data:       pixelBuffer,
   * });
   *
   * @example
   * // Send stereo 48 kHz audio (480 samples per frame = 10 ms)
   * tx.send({
   *   type:              FrameType.Audio,
   *   timestamp:         -1n,
   *   codec:             Codec.FPA1,
   *   sampleRate:        48000,
   *   channels:          2,
   *   samplesPerChannel: 480,
   *   data:              audioBuffer,  // 2 × 480 × 4 = 3840 bytes, planar float32
   * });
   */
  send(frame: MediaFrame): number;

  /**
   * Wait for an incoming metadata frame from a receiver.
   * Resolves with null on timeout.
   */
  receive(timeoutMs?: number): Promise<MediaFrame | null>;

  /**
   * Wait for a tally change across all connected receivers.
   * Returns immediately with the last known state on timeout.
   */
  getTally(timeoutMs?: number): Promise<TallyResult>;

  /** Optionally describe this sender to receivers. */
  setSenderInformation(info: Partial<SenderInfo>): void;

  /**
   * Add XML metadata that is sent to every receiver immediately on connect.
   * Also pushed to all currently connected receivers.
   * @param metadata - UTF-8 XML string with null terminator handled internally.
   */
  addConnectionMetadata(metadata: string): void;

  /** Remove all connection metadata previously added via addConnectionMetadata. */
  clearConnectionMetadata(): void;

  /**
   * Instruct receivers to reconnect to a different address ("virtual source" pattern).
   * @param newAddress - Destination address, or null to disable.
   */
  setRedirect(newAddress: string | null): void;

  getVideoStatistics(): Statistics;
  getAudioStatistics(): Statistics;
}

// ============================================================
// Utility
// ============================================================

/**
 * Returns the list of sources currently discoverable on the network.
 * The array is valid until the next call; copy strings if you need to keep them.
 *
 * @example
 * const sources = getAddresses();
 * // ["STUDIO-PC (Camera 1)", "STUDIO-PC (Playout)", ...]
 */
export declare function getAddresses(): string[];

/**
 * Override the log file path for this process.
 * If never called, logs go to ~/.OMT/logs (macOS/Linux) or C:\ProgramData\OMT\logs (Windows).
 * Set the OMT_STORAGE_PATH environment variable to change the default folder.
 *
 * @param filename - Full path to the log file, or null to disable logging.
 */
export declare function setLoggingFilename(filename: string | null): void;

/**
 * Process-scoped settings that override the persisted settings file for this run.
 * Settings file location: ~/.OMT/settings.xml (macOS/Linux) or C:\ProgramData\OMT\settings.xml (Windows).
 * Set OMT_STORAGE_PATH to override the folder.
 *
 * ### Supported setting names
 * | Name | Type | Description |
 * |---|---|---|
 * | `DiscoveryServer` | string | `omt://hostname:port` — disables DNS-SD when set |
 * | `NetworkPortStart` | integer | First port for Sender instances (default 6400) |
 * | `NetworkPortEnd` | integer | Last port for Sender instances (default 6600) |
 */
export declare const settings: {
  getString(name: string): string;
  setString(name: string, value: string): void;
  getInteger(name: string): number;
  setInteger(name: string, value: number): void;
};
