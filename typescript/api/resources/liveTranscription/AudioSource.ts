import type { LiveTranscriptionSession } from "./LiveTranscriptionSession.js";

export interface AudioSource {
    start(): Promise<void> | void;
    stop(): Promise<void> | void;
    pipeTo(session: LiveTranscriptionSession): Promise<void>;
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
}
