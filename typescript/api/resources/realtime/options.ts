export enum RealtimeModel {
    Lilac = "lilac",
    Violet = "violet",
    Iris = "iris",
    Orchid = "orchid",
}

export enum OutputModality {
    Text = "text",
    Audio = "audio",
}

/**
 * Options for a realtime translation session.
 *
 * `sourceLanguage` and `targetLanguage` are required; all other fields have
 * server-side defaults. Language values use IETF BCP-47 tags
 * (e.g. `"en-US"`, `"de-DE"`).
 */
export interface ConnectOptions {
    model?: RealtimeModel;
    sourceLanguage: string;
    targetLanguage: string;
    outputModalities?: OutputModality[];
    /**
     * Synthesize the translation with one of your cloned voices. Pass the ID
     * of a voice you own (from `voices.list()` or a custom voice you created).
     * When omitted, a built-in voice for `targetLanguage` is used.
     *
     * For the most natural-sounding results, choose a voice whose reference
     * language matches `targetLanguage`.
     */
    voiceId?: number;
    /** Override the WebSocket base URL (e.g. for staging). */
    baseUrl?: string;
    /** Override the API key resolved from the parent client. */
    apiKey?: string;
}

export interface ResolvedConnectOptions {
    model: RealtimeModel;
    sourceLanguage: string;
    targetLanguage: string;
    outputModalities: OutputModality[];
    voiceId?: number;
}

export const DEFAULT_MODEL: RealtimeModel = RealtimeModel.Iris;
export const DEFAULT_OUTPUT_MODALITIES: OutputModality[] = [
    OutputModality.Text,
    OutputModality.Audio,
];

export function resolveOptions(opts: ConnectOptions): ResolvedConnectOptions {
    return {
        model: opts.model ?? DEFAULT_MODEL,
        sourceLanguage: opts.sourceLanguage,
        targetLanguage: opts.targetLanguage,
        outputModalities: opts.outputModalities ?? DEFAULT_OUTPUT_MODALITIES,
        voiceId: opts.voiceId,
    };
}

/** Query-string parameters sent on the WebSocket upgrade URL. */
export function toQuery(opts: ResolvedConnectOptions): URLSearchParams {
    const params = new URLSearchParams();
    params.set("model", opts.model);
    return params;
}

/** Body of the `session.update` message sent after the WS handshake. */
export function toSessionPayload(opts: ResolvedConnectOptions): Record<string, unknown> {
    const session: Record<string, unknown> = {
        model: opts.model,
        source_language: opts.sourceLanguage,
        target_language: opts.targetLanguage,
        output_modalities: opts.outputModalities,
    };
    if (opts.voiceId !== undefined) {
        session.voice = { type: "cloned", voice_id: opts.voiceId };
    }
    return session;
}
