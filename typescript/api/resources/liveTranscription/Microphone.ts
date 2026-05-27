import type { AudioSource } from "./AudioSource.js";
import { MicrophoneUnavailableError } from "./errors.js";
import type { LiveTranscriptionSession } from "./LiveTranscriptionSession.js";
import { assertSoxAvailable, SoxRequiredError } from "../../../sox.js";

export interface BrowserMicrophoneOptions {
    sampleRate?: number;
    chunkMs?: number;
    deviceId?: string;
}

export interface NodeMicrophoneOptions {
    sampleRate?: number;
    /** Capture device name passed to the underlying recorder. */
    device?: string;
}

/**
 * Microphone factory — picks an adapter for the host environment.
 *
 * In a browser:
 *   const mic = await Microphone.fromBrowser({ sampleRate: 16000 });
 *
 * In Node:
 *   const mic = Microphone.fromNode({ sampleRate: 16000 });
 *
 * Both adapters implement `AudioSource` and can be passed to
 * `session.pipe(mic)`.
 */
export class Microphone {
    static async fromBrowser(opts: BrowserMicrophoneOptions = {}): Promise<BrowserMicrophone> {
        if (typeof globalThis === "undefined" || typeof (globalThis as any).window === "undefined") {
            throw new MicrophoneUnavailableError(
                "Microphone.fromBrowser must run in a browser environment.",
            );
        }
        const sampleRate = opts.sampleRate ?? 16000;
        const chunkMs = opts.chunkMs ?? 100;
        const constraints: MediaStreamConstraints = {
            audio: opts.deviceId
                ? { deviceId: { exact: opts.deviceId } }
                : true,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return new BrowserMicrophone(stream, sampleRate, chunkMs);
    }

    static fromNode(opts: NodeMicrophoneOptions = {}): NodeMicrophone {
        return new NodeMicrophone(opts);
    }
}

/**
 * Browser microphone adapter. Uses an `AudioWorklet` to downsample the
 * platform sample rate to the requested rate and emit signed 16-bit PCM
 * little-endian chunks — exactly what the server expects for `linear16`.
 */
export class BrowserMicrophone implements AudioSource {
    private readonly audioContext: AudioContext;
    private worklet?: AudioWorkletNode;
    private sourceNode?: MediaStreamAudioSourceNode;
    private readonly queue: Uint8Array[] = [];
    private waiter?: (chunk: Uint8Array) => void;
    private stopped = false;

    constructor(
        private readonly stream: MediaStream,
        private readonly targetSampleRate: number,
        private readonly chunkMs: number,
    ) {
        const AC: typeof AudioContext =
            (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
        if (!AC) {
            throw new MicrophoneUnavailableError("AudioContext is not available.");
        }
        this.audioContext = new AC();
    }

    async start(): Promise<void> {
        const samplesPerChunk = Math.floor((this.targetSampleRate * this.chunkMs) / 1000);
        const workletSource = `
            class CambPcmCapture extends AudioWorkletProcessor {
                constructor() {
                    super();
                    this._buffer = [];
                    this._samplesPerChunk = ${samplesPerChunk};
                    this._inSampleRate = sampleRate;
                    this._outSampleRate = ${this.targetSampleRate};
                    this._ratio = this._inSampleRate / this._outSampleRate;
                    this._inAcc = [];
                }
                process(inputs) {
                    const input = inputs[0];
                    if (!input || !input[0]) return true;
                    const channel = input[0];
                    for (let i = 0; i < channel.length; i++) {
                        this._inAcc.push(channel[i]);
                    }
                    while (this._inAcc.length >= this._ratio) {
                        const idx = 0;
                        const sample = this._inAcc[idx];
                        this._inAcc.splice(0, Math.floor(this._ratio));
                        const clamped = Math.max(-1, Math.min(1, sample));
                        const pcm = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
                        this._buffer.push(pcm | 0);
                        if (this._buffer.length >= this._samplesPerChunk) {
                            const out = new Int16Array(this._buffer);
                            this._buffer = [];
                            this.port.postMessage(out.buffer, [out.buffer]);
                        }
                    }
                    return true;
                }
            }
            registerProcessor("camb-pcm-capture", CambPcmCapture);
        `;
        const blob = new Blob([workletSource], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await this.audioContext.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
        this.worklet = new AudioWorkletNode(this.audioContext, "camb-pcm-capture");
        this.worklet.port.onmessage = (event: MessageEvent) => {
            const buf = new Uint8Array(event.data as ArrayBuffer);
            if (this.waiter) {
                const w = this.waiter;
                this.waiter = undefined;
                w(buf);
            } else {
                this.queue.push(buf);
            }
        };
        this.sourceNode.connect(this.worklet);
    }

    async stop(): Promise<void> {
        this.stopped = true;
        try {
            this.sourceNode?.disconnect();
            this.worklet?.disconnect();
            this.stream.getTracks().forEach((t) => t.stop());
            await this.audioContext.close();
        } catch {
            // Best-effort teardown; ignore errors from already-closed nodes.
        }
        if (this.waiter) {
            const w = this.waiter;
            this.waiter = undefined;
            w(new Uint8Array(0));
        }
    }

    async pipeTo(session: LiveTranscriptionSession): Promise<void> {
        await session.pipe(this);
    }

    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        return {
            next: async (): Promise<IteratorResult<Uint8Array>> => {
                if (this.queue.length > 0) {
                    return { value: this.queue.shift()!, done: false };
                }
                if (this.stopped) {
                    return { value: new Uint8Array(0), done: true };
                }
                const chunk = await new Promise<Uint8Array>((resolve) => {
                    this.waiter = resolve;
                });
                if (chunk.byteLength === 0 && this.stopped) {
                    return { value: chunk, done: true };
                }
                return { value: chunk, done: false };
            },
        };
    }
}

/**
 * Node microphone adapter. Backed by `node-record-lpcm16` (declared as an
 * optional dependency); install it explicitly if you need Node capture:
 *
 *     npm install node-record-lpcm16
 *
 * The recorder also needs `sox` installed on the host machine.
 */
export class NodeMicrophone implements AudioSource {
    private readonly queue: Uint8Array[] = [];
    private waiter?: (chunk: Uint8Array) => void;
    private recording: any;
    private stopped = false;

    constructor(private readonly opts: NodeMicrophoneOptions) {}

    async start(): Promise<void> {
        try {
            await assertSoxAvailable();
        } catch (err) {
            if (err instanceof SoxRequiredError) {
                throw new MicrophoneUnavailableError(err.message);
            }
            throw err;
        }
        let recordFn: ((options: object) => unknown) | undefined;
        try {
            // Dynamic import so users without the optional dep can still
            // import the rest of the SDK.
            const mod: any = await import("node-record-lpcm16" as any);
            recordFn = mod.default?.record ?? mod.record;
        } catch (err) {
            throw new MicrophoneUnavailableError(
                "Install 'node-record-lpcm16' (and the host's sox binary) to use Microphone.fromNode.",
            );
        }
        if (typeof recordFn !== "function") {
            throw new MicrophoneUnavailableError(
                "Could not load 'node-record-lpcm16'; reinstall the package.",
            );
        }
        this.recording = recordFn({
            sampleRate: this.opts.sampleRate ?? 16000,
            channels: 1,
            audioType: "raw",
            device: this.opts.device,
        });
        const stream = this.recording.stream();
        stream.on("data", (chunk: Buffer) => {
            if (chunk.length === 0) return;
            const buf = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
            if (this.waiter) {
                const w = this.waiter;
                this.waiter = undefined;
                w(buf);
            } else {
                this.queue.push(buf);
            }
        });
        stream.on("end", () => {
            this.stopped = true;
            if (this.waiter) {
                const w = this.waiter;
                this.waiter = undefined;
                w(new Uint8Array(0));
            }
        });
    }

    async stop(): Promise<void> {
        this.stopped = true;
        try {
            this.recording?.stop?.();
        } catch {
            // best-effort
        }
    }

    async pipeTo(session: LiveTranscriptionSession): Promise<void> {
        await session.pipe(this);
    }

    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        return {
            next: async (): Promise<IteratorResult<Uint8Array>> => {
                if (this.queue.length > 0) {
                    return { value: this.queue.shift()!, done: false };
                }
                if (this.stopped) {
                    return { value: new Uint8Array(0), done: true };
                }
                const chunk = await new Promise<Uint8Array>((resolve) => {
                    this.waiter = resolve;
                });
                if (chunk.byteLength === 0 && this.stopped) {
                    return { value: chunk, done: true };
                }
                return { value: chunk, done: false };
            },
        };
    }
}
