/**
 * Typed server events emitted over the realtime WebSocket.
 *
 * Adding a new server event requires three edits:
 *   1. Add a member to `ServerEventType`.
 *   2. Define the payload type below.
 *   3. Register a parser in `PARSER_REGISTRY` (or add manual handling in
 *      `RealtimeSession` for events that need transformation, such as
 *      `AudioDelta` and `Error`).
 */

export enum ServerEventType {
    SessionStarting = "session.starting",
    SessionCreated = "session.created",
    SessionUpdated = "session.updated",
    TranscriptCompleted = "conversation.item.input_audio_transcription.completed",
    TextDelta = "response.text.delta",
    TextDone = "response.text.done",
    /** Handled manually — binary frame or base64 JSON delta. */
    AudioDelta = "response.audio.delta",
    AudioDone = "response.audio.done",
    Error = "error",
    /** Synthetic — emitted by the SDK when the transport closes, never sent by the server. */
    Closed = "Closed",
}

export interface SessionStartingEvent {
    readonly type: ServerEventType.SessionStarting;
}

export interface SessionInfo {
    id: string;
    model: string;
    sourceLanguage: string;
    targetLanguage: string;
    outputModalities: string[];
}

export interface SessionConfig {
    model?: string;
    sourceLanguage: string;
    targetLanguage: string;
    outputModalities: string[];
}

export interface SessionCreatedEvent {
    readonly type: ServerEventType.SessionCreated;
    session: SessionInfo;
}

export interface SessionUpdatedEvent {
    readonly type: ServerEventType.SessionUpdated;
    session: SessionConfig;
}

export interface TranscriptCompletedEvent {
    readonly type: ServerEventType.TranscriptCompleted;
    transcript: string;
}

export interface TextDeltaEvent {
    readonly type: ServerEventType.TextDelta;
    delta: string;
}

export interface TextDoneEvent {
    readonly type: ServerEventType.TextDone;
    text: string;
}

export interface AudioDeltaEvent {
    readonly type: ServerEventType.AudioDelta;
    /**
     * Raw PCM bytes regardless of whether the server delivered them as a
     * binary WebSocket frame or a base64-encoded JSON delta. Normalisation
     * happens inside the session dispatcher before reaching handlers.
     */
    data: Uint8Array;
}

export interface AudioDoneEvent {
    readonly type: ServerEventType.AudioDone;
}

export interface ErrorEvent {
    readonly type: ServerEventType.Error;
    message: string;
    raw: unknown;
}

export interface ClosedEvent {
    readonly type: ServerEventType.Closed;
    code: number;
    reason: string;
}

/** Type-level mapping used by the session's `on` overload. */
export interface ServerEventPayloads {
    [ServerEventType.SessionStarting]: SessionStartingEvent;
    [ServerEventType.SessionCreated]: SessionCreatedEvent;
    [ServerEventType.SessionUpdated]: SessionUpdatedEvent;
    [ServerEventType.TranscriptCompleted]: TranscriptCompletedEvent;
    [ServerEventType.TextDelta]: TextDeltaEvent;
    [ServerEventType.TextDone]: TextDoneEvent;
    [ServerEventType.AudioDelta]: AudioDeltaEvent;
    [ServerEventType.AudioDone]: AudioDoneEvent;
    [ServerEventType.Error]: ErrorEvent;
    [ServerEventType.Closed]: ClosedEvent;
}

type Parser<T> = (raw: any) => T;

function parseSessionInfo(raw: any): SessionInfo {
    return {
        id: raw?.id ?? "",
        model: raw?.model ?? "",
        sourceLanguage: raw?.source_language ?? "",
        targetLanguage: raw?.target_language ?? "",
        outputModalities: Array.isArray(raw?.output_modalities) ? raw.output_modalities : [],
    };
}

function parseSessionConfig(raw: any): SessionConfig {
    return {
        model: raw?.model,
        sourceLanguage: raw?.source_language ?? "",
        targetLanguage: raw?.target_language ?? "",
        outputModalities: Array.isArray(raw?.output_modalities) ? raw.output_modalities : [],
    };
}

/**
 * AudioDelta and Error are intentionally absent — they need transformation
 * (base64 decode and nested-object flattening respectively) before parsing,
 * so `RealtimeSession` handles them manually.
 */
export const PARSER_REGISTRY: {
    [K in Exclude<
        ServerEventType,
        ServerEventType.AudioDelta | ServerEventType.Error
    >]: Parser<ServerEventPayloads[K]>;
} = {
    [ServerEventType.SessionStarting]: () => ({ type: ServerEventType.SessionStarting }),
    [ServerEventType.SessionCreated]: (raw: any) => ({
        type: ServerEventType.SessionCreated,
        session: parseSessionInfo(raw?.session),
    }),
    [ServerEventType.SessionUpdated]: (raw: any) => ({
        type: ServerEventType.SessionUpdated,
        session: parseSessionConfig(raw?.session),
    }),
    [ServerEventType.TranscriptCompleted]: (raw: any) => ({
        type: ServerEventType.TranscriptCompleted,
        transcript: raw?.transcript ?? "",
    }),
    [ServerEventType.TextDelta]: (raw: any) => ({
        type: ServerEventType.TextDelta,
        delta: raw?.delta ?? "",
    }),
    [ServerEventType.TextDone]: (raw: any) => ({
        type: ServerEventType.TextDone,
        text: raw?.text ?? "",
    }),
    [ServerEventType.AudioDone]: () => ({ type: ServerEventType.AudioDone }),
    [ServerEventType.Closed]: (raw: any) => ({
        type: ServerEventType.Closed,
        code: raw?.code ?? 1000,
        reason: raw?.reason ?? "",
    }),
};
