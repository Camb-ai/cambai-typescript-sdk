/**
 * Typed events emitted by the live transcription session.
 *
 * Adding a new server event requires three edits:
 *   1. Add a member to `ServerMessageType`.
 *   2. Define the payload type below.
 *   3. Register a parser in `PARSER_REGISTRY`.
 */

export enum ServerMessageType {
    Ready = "Ready",
    Results = "Results",
    Final = "Final",
    Error = "Error",
    Closed = "Closed",
}

export interface ReadyEvent {
    readonly type: ServerMessageType.Ready;
}

export interface Word {
    word: string;
    start: number;
    end: number;
    confidence: number;
}

export interface Alternative {
    transcript: string;
    confidence: number;
    words: Word[];
}

export interface Channel {
    alternatives: Alternative[];
}

export interface ModelInfo {
    name?: string;
    version?: string;
}

export interface Metadata {
    requestId?: string;
    modelUuid?: string;
    modelInfo?: ModelInfo;
}

export interface ResultsEvent {
    readonly type: ServerMessageType.Results;
    /** Always `false` in the current server release. */
    isFinal: boolean;
    /** Seconds since session start at which the segment begins. */
    start: number;
    /** Segment duration in seconds; may be `0` for interim deltas. */
    duration: number;
    channel: Channel;
    metadata?: Metadata;
    /** Convenience accessor for `channel.alternatives[0].transcript`. */
    transcript: string;
    /** Convenience accessor for `channel.alternatives[0].confidence`. */
    confidence: number;
    /** Convenience accessor for `channel.alternatives[0].words`. */
    words: Word[];
}

export interface FinalEvent extends Omit<ResultsEvent, "type" | "isFinal"> {
    readonly type: ServerMessageType.Final;
    isFinal: true;
}

export interface ErrorEvent {
    readonly type: ServerMessageType.Error;
    code?: string;
    message: string;
    raw: unknown;
}

export interface ClosedEvent {
    readonly type: ServerMessageType.Closed;
    code: number;
    reason: string;
}

/**
 * Type-level mapping used by the session's `on` overload so handlers receive
 * a precisely typed payload (e.g. `session.on(ServerMessageType.Results, msg
 * => msg.transcript)` types `msg` as `ResultsEvent`).
 */
export interface ServerEventPayloads {
    [ServerMessageType.Ready]: ReadyEvent;
    [ServerMessageType.Results]: ResultsEvent;
    [ServerMessageType.Final]: FinalEvent;
    [ServerMessageType.Error]: ErrorEvent;
    [ServerMessageType.Closed]: ClosedEvent;
}

type Parser<T> = (raw: any) => T;

function parseResults(raw: any): ResultsEvent {
    const channel: Channel = {
        alternatives: Array.isArray(raw?.channel?.alternatives)
            ? raw.channel.alternatives.map((alt: any) => ({
                  transcript: alt?.transcript ?? "",
                  confidence: alt?.confidence ?? 0,
                  words: Array.isArray(alt?.words)
                      ? alt.words.map((w: any) => ({
                            word: w?.word ?? "",
                            start: w?.start ?? 0,
                            end: w?.end ?? 0,
                            confidence: w?.confidence ?? 0,
                        }))
                      : [],
              }))
            : [],
    };
    const first = channel.alternatives[0];
    const metadata: Metadata | undefined = raw?.metadata
        ? {
              requestId: raw.metadata.request_id,
              modelUuid: raw.metadata.model_uuid,
              modelInfo: raw.metadata.model_info,
          }
        : undefined;
    return {
        type: ServerMessageType.Results,
        isFinal: Boolean(raw?.is_final),
        start: raw?.start ?? 0,
        duration: raw?.duration ?? 0,
        channel,
        metadata,
        transcript: first?.transcript ?? "",
        confidence: first?.confidence ?? 0,
        words: first?.words ?? [],
    };
}

function parseFinal(raw: any): FinalEvent {
    const base = parseResults(raw);
    return { ...base, type: ServerMessageType.Final, isFinal: true } as FinalEvent;
}

export const PARSER_REGISTRY: {
    [K in ServerMessageType]: Parser<ServerEventPayloads[K]>;
} = {
    [ServerMessageType.Ready]: () => ({ type: ServerMessageType.Ready }),
    [ServerMessageType.Results]: parseResults,
    [ServerMessageType.Final]: parseFinal,
    [ServerMessageType.Error]: (raw: any) => ({
        type: ServerMessageType.Error,
        code: raw?.code,
        message: raw?.message ?? raw?.description ?? "Unknown server error",
        raw,
    }),
    [ServerMessageType.Closed]: (raw: any) => ({
        type: ServerMessageType.Closed,
        code: raw?.code ?? 1000,
        reason: raw?.reason ?? "",
    }),
};
