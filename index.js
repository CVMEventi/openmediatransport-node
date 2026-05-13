import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let binding;
try {
  binding = require('./build/Release/omt.node');
} catch {
  const msg =
    `openmediatransport native addon is not available on platform "${process.platform}". ` +
    `Supported platforms are macOS and Windows.`;
  const unsupported = () => { throw new Error(msg); };
  const enumNames = ['FrameType', 'Codec', 'Quality', 'ColorSpace', 'VideoFlags', 'PreferredVideoFormat', 'ReceiveFlags'];
  binding = new Proxy({}, {
    get(_, prop) {
      if (enumNames.includes(String(prop))) return {};
      return unsupported;
    }
  });
}

// ============================================================
// Enums
// ============================================================

export const FrameType            = binding.FrameType;
export const Codec                = binding.Codec;
export const Quality              = binding.Quality;
export const ColorSpace           = binding.ColorSpace;
export const VideoFlags           = binding.VideoFlags;
export const PreferredVideoFormat = binding.PreferredVideoFormat;
export const ReceiveFlags         = binding.ReceiveFlags;

const ALL_FRAME_TYPES = (FrameType.Video | FrameType.Audio | FrameType.Metadata) || 7;

// ============================================================
// Receiver
// ============================================================

export class Receiver {
  #instance;

  /**
   * @param {string} address - Full discovery name or omt://hostname:port URL
   * @param {number} [frameTypes] - Bitmask of FrameType values to receive
   * @param {number} [format] - Preferred uncompressed video format (PreferredVideoFormat)
   * @param {number} [flags] - ReceiveFlags bitmask
   */
  constructor(
    address,
    frameTypes = ALL_FRAME_TYPES,
    format = PreferredVideoFormat.UYVY ?? 0,
    flags = ReceiveFlags.None ?? 0,
  ) {
    const inst = binding.receiveCreate(address, frameTypes, format, flags);
    if (!inst) throw new Error(`Failed to connect to "${address}"`);
    this.#instance = inst;
  }

  /** Disconnect and release resources. Safe to call multiple times. */
  destroy() {
    if (this.#instance) {
      binding.receiveDestroy(this.#instance);
      this.#instance = null;
    }
  }

  /** Supports the `using` keyword (explicit resource management proposal). */
  [Symbol.dispose]() { this.destroy(); }

  #assertAlive() {
    if (!this.#instance) throw new Error('Receiver has been destroyed');
  }

  /**
   * Wait for the next incoming frame.
   * @param {number} [timeoutMs] - Max wait time in milliseconds
   * @param {number} [frameTypes] - Frame types to accept (defaults to all)
   * @returns {Promise<object|null>} OMTMediaFrame object or null on timeout
   */
  receive(timeoutMs = 1000, frameTypes = ALL_FRAME_TYPES) {
    this.#assertAlive();
    return binding.receive(this.#instance, frameTypes, timeoutMs);
  }

  /**
   * Send a metadata frame back to the sender.
   * @param {object} frame
   * @returns {number}
   */
  sendMetadata(frame) {
    this.#assertAlive();
    return binding.receiveSend(this.#instance, frame);
  }

  /**
   * Report tally state to the sender.
   * @param {{ preview: number, program: number }} tally
   */
  setTally(tally) {
    this.#assertAlive();
    binding.receiveSetTally(this.#instance, tally);
  }

  /**
   * Wait for a tally change from the sender.
   * @param {number} [timeoutMs]
   * @returns {Promise<{ changed: number, tally: { preview: number, program: number } }>}
   */
  getTally(timeoutMs = 1000) {
    this.#assertAlive();
    return binding.receiveGetTally(this.#instance, timeoutMs);
  }

  /**
   * Dynamically change receive flags (e.g. switch to/from preview mode).
   * @param {number} flags - ReceiveFlags bitmask
   */
  setFlags(flags) {
    this.#assertAlive();
    binding.receiveSetFlags(this.#instance, flags);
  }

  /**
   * Suggest a preferred encoding quality to the sender.
   * @param {number} quality - Quality enum value
   */
  setSuggestedQuality(quality) {
    this.#assertAlive();
    binding.receiveSetSuggestedQuality(this.#instance, quality);
  }

  /**
   * @returns {{ productName: string, manufacturer: string, version: string }}
   */
  getSenderInformation() {
    this.#assertAlive();
    return binding.receiveGetSenderInformation(this.#instance);
  }

  /** @returns {object} Video statistics */
  getVideoStatistics() {
    this.#assertAlive();
    return binding.receiveGetVideoStatistics(this.#instance);
  }

  /** @returns {object} Audio statistics */
  getAudioStatistics() {
    this.#assertAlive();
    return binding.receiveGetAudioStatistics(this.#instance);
  }
}

// ============================================================
// Sender
// ============================================================

export class Sender {
  #instance;

  /**
   * @param {string} name - Source name (without hostname)
   * @param {number} [quality] - Encoding quality (Quality enum)
   */
  constructor(name, quality = Quality.Default ?? 0) {
    const inst = binding.sendCreate(name, quality);
    if (!inst) throw new Error(`Failed to create sender "${name}"`);
    this.#instance = inst;
  }

  /** Shut down and release resources. Safe to call multiple times. */
  destroy() {
    if (this.#instance) {
      binding.sendDestroy(this.#instance);
      this.#instance = null;
    }
  }

  /** Supports the `using` keyword (explicit resource management proposal). */
  [Symbol.dispose]() { this.destroy(); }

  #assertAlive() {
    if (!this.#instance) throw new Error('Sender has been destroyed');
  }

  /** Discovery address in "HOSTNAME (NAME)" format. */
  get address() {
    this.#assertAlive();
    return binding.sendGetAddress(this.#instance);
  }

  /** Current number of connected receiver connections. */
  get connections() {
    this.#assertAlive();
    return binding.sendConnections(this.#instance);
  }

  /**
   * Send a frame to all connected receivers.
   * @param {object} frame - OMTMediaFrame object
   * @returns {number}
   */
  send(frame) {
    this.#assertAlive();
    return binding.send(this.#instance, frame);
  }

  /**
   * Wait for an incoming metadata frame from a receiver.
   * @param {number} [timeoutMs]
   * @returns {Promise<object|null>}
   */
  receive(timeoutMs = 1000) {
    this.#assertAlive();
    return binding.sendReceive(this.#instance, timeoutMs);
  }

  /**
   * Wait for a tally change across all connected receivers.
   * @param {number} [timeoutMs]
   * @returns {Promise<{ changed: number, tally: { preview: number, program: number } }>}
   */
  getTally(timeoutMs = 1000) {
    this.#assertAlive();
    return binding.sendGetTally(this.#instance, timeoutMs);
  }

  /**
   * @param {{ productName?: string, manufacturer?: string, version?: string }} info
   */
  setSenderInformation(info) {
    this.#assertAlive();
    binding.sendSetSenderInformation(this.#instance, info);
  }

  /**
   * Add XML metadata sent to every receiver on connect.
   * @param {string} metadata - UTF-8 XML string
   */
  addConnectionMetadata(metadata) {
    this.#assertAlive();
    binding.sendAddConnectionMetadata(this.#instance, metadata);
  }

  /** Remove all connection metadata. */
  clearConnectionMetadata() {
    this.#assertAlive();
    binding.sendClearConnectionMetadata(this.#instance);
  }

  /**
   * Redirect receivers to a different address.
   * @param {string|null} newAddress - Pass null to disable redirect
   */
  setRedirect(newAddress) {
    this.#assertAlive();
    binding.sendSetRedirect(this.#instance, newAddress);
  }

  /** @returns {object} Video statistics */
  getVideoStatistics() {
    this.#assertAlive();
    return binding.sendGetVideoStatistics(this.#instance);
  }

  /** @returns {object} Audio statistics */
  getAudioStatistics() {
    this.#assertAlive();
    return binding.sendGetAudioStatistics(this.#instance);
  }
}

// ============================================================
// Utility
// ============================================================

/** @returns {string[]} Currently discoverable sources on the network */
export const getAddresses = () => binding.discoveryGetAddresses();

/**
 * Override the log file path. Pass null to disable file logging.
 * @param {string|null} filename
 */
export const setLoggingFilename = (filename) => binding.setLoggingFilename(filename);

/** Process-scoped settings that override ~/.OMT/settings.xml for this run. */
export const settings = {
  getString:  (name)        => binding.settingsGetString(name),
  setString:  (name, value) => binding.settingsSetString(name, value),
  getInteger: (name)        => binding.settingsGetInteger(name),
  setInteger: (name, value) => binding.settingsSetInteger(name, value),
};
