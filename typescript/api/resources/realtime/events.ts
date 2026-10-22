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
    TranscriptDelta = "conversation.item.input_audio_transcription.delta",
    TranscriptCompleted = "conversation.item.input_audio_transcription.completed",
    TextDelta = "response.text.delta",
    TextDone = "response.text.done",
    /**
     * Synthetic, like `Closed`: the server frames output audio as raw binary WebSocket frames,
     * never as a JSON event. The read loop turns each binary frame into this event. A base64 JSON
     * form is also accepted under this name, which no server version sends — kept only so a future
     * server could introduce it without breaking older clients.
     */
    AudioDelta = "response.audio.delta",
    AudioDone = "response.audio.done",
    Error = "error",
    /** Sent only to sessions whose source language is detected automatically. */
    SourceLanguageChanged = "session.source_language_changed",
    /** Sent only to `single_known_speaker` sessions; see {@link SourceLanguageSwitchConfirmationRequestedEvent}. */
    SourceLanguageSwitchConfirmationRequested = "session.source_language_switch_confirmation_requested",
    /** Synthetic — emitted by the SDK when the transport closes, never sent by the server. */
    Closed = "Closed",
}

export interface SessionStartingEvent {
    readonly type: ServerEventType.SessionStarting;
}

export interface SessionInfo {
    id: string;
    mode: string;
    sourceLanguage: string;
    targetLanguage: string;
    outputModalities: string[];
    /**
     * Resolved voice, e.g. `{ type: "cloned", voice_id: 123 }`. Omitted by the server
     * (`undefined` here) when the default built-in voice is used.
     */
    voice?: Record<string, unknown>;
}

export interface SessionConfig {
    mode?: string;
    sourceLanguage: string;
    targetLanguage: string;
    outputModalities: string[];
    voice?: Record<string, unknown>;
}

export interface SessionCreatedEvent {
    readonly type: ServerEventType.SessionCreated;
    session: SessionInfo;
}

export interface SessionUpdatedEvent {
    readonly type: ServerEventType.SessionUpdated;
    session: SessionConfig;
}

/**
 * Incremental transcript of what the user is saying, in the source language.
 *
 * Deltas are additive within one utterance and reset after the corresponding
 * `TranscriptCompletedEvent`. This is the live source-transcript stream — the counterpart to
 * `TextDeltaEvent`, which carries the translation.
 */
export interface TranscriptDeltaEvent {
    readonly type: ServerEventType.TranscriptDelta;
    delta: string;
}

export interface TranscriptCompletedEvent {
    readonly type: ServerEventType.TranscriptCompleted;
    transcript: string;
    // The three fields below are sent only when the source language is detected automatically.
    /** Identifies the utterance, e.g. for `session.ignoreUtteranceForLanguageDetection(...)`. */
    itemId?: string;
    /** The language the utterance was identified as; absent when it was too short or too ambiguous. */
    language?: string;
    /** `true` when the utterance was already in the target language, so it was passed through as text. */
    passthrough?: boolean;
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
    /**
     * Stable, machine-readable error code, e.g. `"insufficient_credits"`. Branch on this, not on
     * `message`. Absent only for errors the SDK raises itself, such as a transport error.
     */
    code?: string;
    /** The error's category, e.g. `"authentication_error"` or `"server_error"`. */
    errorType?: string;
    /** The field at fault, e.g. `"session.target_language"`. */
    param?: string;
    raw: unknown;
}

/**
 * The session's source language changed: detected for the first time, detected as having
 * switched, or set by the client.
 */
export interface SourceLanguageChangedEvent {
    readonly type: ServerEventType.SourceLanguageChanged;
    language: string;
    previousLanguage?: string;
}

/**
 * A `single_known_speaker` session heard sustained speech in its own target language. That is
 * usually the other party coming through the loudspeakers rather than the local speaker switching
 * language, so the server does not switch on its own. Confirm with
 * `session.updateLanguages({ sourceLanguage: event.language })`, or ignore it.
 */
export interface SourceLanguageSwitchConfirmationRequestedEvent {
    readonly type: ServerEventType.SourceLanguageSwitchConfirmationRequested;
    language: string;
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
    [ServerEventType.TranscriptDelta]: TranscriptDeltaEvent;
    [ServerEventType.TranscriptCompleted]: TranscriptCompletedEvent;
    [ServerEventType.TextDelta]: TextDeltaEvent;
    [ServerEventType.TextDone]: TextDoneEvent;
    [ServerEventType.AudioDelta]: AudioDeltaEvent;
    [ServerEventType.AudioDone]: AudioDoneEvent;
    [ServerEventType.Error]: ErrorEvent;
    [ServerEventType.SourceLanguageChanged]: SourceLanguageChangedEvent;
    [ServerEventType.SourceLanguageSwitchConfirmationRequested]: SourceLanguageSwitchConfirmationRequestedEvent;
    [ServerEventType.Closed]: ClosedEvent;
}

type Parser<T> = (raw: any) => T;

function parseSessionInfo(raw: any): SessionInfo {
    return {
        id: raw?.id ?? "",
        // Falls back to the retired `model` key so this SDK also parses a pre-rename server. This
        // parser tolerates missing fields by construction, which is why the rename never broke the
        // TypeScript SDK the way it broke the Python one — but falling back to `""` would leave
        // callers reading an empty mode, so prefer the old key over nothing.
        mode: raw?.mode ?? raw?.model ?? "",
        sourceLanguage: raw?.source_language ?? "",
        targetLanguage: raw?.target_language ?? "",
        outputModalities: Array.isArray(raw?.output_modalities) ? raw.output_modalities : [],
        voice: raw?.voice,
    };
}

function parseSessionConfig(raw: any): SessionConfig {
    return {
        mode: raw?.mode ?? raw?.model,
        sourceLanguage: raw?.source_language ?? "",
        targetLanguage: raw?.target_language ?? "",
        outputModalities: Array.isArray(raw?.output_modalities) ? raw.output_modalities : [],
        voice: raw?.voice,
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
    [ServerEventType.TranscriptDelta]: (raw: any) => ({
        type: ServerEventType.TranscriptDelta,
        delta: raw?.delta ?? "",
    }),
    [ServerEventType.TranscriptCompleted]: (raw: any) => ({
        type: ServerEventType.TranscriptCompleted,
        transcript: raw?.transcript ?? "",
        itemId: raw?.item_id ?? undefined,
        language: raw?.language ?? undefined,
        passthrough: raw?.passthrough ?? undefined,
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
    [ServerEventType.SourceLanguageChanged]: (raw: any) => ({
        type: ServerEventType.SourceLanguageChanged,
        language: raw?.language ?? "",
        previousLanguage: raw?.previous_language ?? undefined,
    }),
    [ServerEventType.SourceLanguageSwitchConfirmationRequested]: (raw: any) => ({
        type: ServerEventType.SourceLanguageSwitchConfirmationRequested,
        language: raw?.language ?? "",
    }),
    [ServerEventType.Closed]: (raw: any) => ({
        type: ServerEventType.Closed,
        code: raw?.code ?? 1000,
        reason: raw?.reason ?? "",
    }),
};
