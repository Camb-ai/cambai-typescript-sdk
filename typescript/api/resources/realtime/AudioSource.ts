/**
 * Minimal contract for anything that can be piped into a realtime session.
 *
 * The `AudioSource` from live_transcription satisfies this shape, so a
 * `Microphone` or file source can be reused across both modules.
 */
export interface RealtimeAudioSource {
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array>;
    /** Optional teardown invoked when the session stops pulling chunks. */
    stop?(): Promise<void> | void;
}
