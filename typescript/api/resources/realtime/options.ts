/**
 * Latency/quality tradeoff for a realtime session.
 *
 * `Fast` is ready to accept audio almost immediately and translates with the lowest latency, but
 * supports fewer languages. `Slow` supports the full language list and translates more accurately,
 * at the cost of a 30s+ cold boot before the session is ready.
 *
 * Replaces the former `RealtimeModel` engine codenames (`lilac`/`violet`/`iris`/`orchid`), which
 * the server no longer accepts.
 */
export enum RealtimeMode {
    Fast = "fast",
    Slow = "slow",
}

export enum OutputModality {
    Text = "text",
    Audio = "audio",
}

/** Pass as `sourceLanguage` to have the server detect what the speaker is saying. */
export const AUTOMATIC_SOURCE_LANGUAGE = "auto";

/**
 * Who speaks into a session whose source language is detected automatically. Decides how readily
 * the detected language switches.
 *
 * `ChangingSpeakers` (the server's default) suits a remote party, a meeting room or a broadcast.
 * `SingleKnownSpeaker` suits the local microphone: its language switches only after sustained
 * speech, so the other party heard through the loudspeakers cannot switch it, and a switch to the
 * session's own target language is put to the client to confirm instead.
 */
export enum SpeakerSetup {
    ChangingSpeakers = "changing_speakers",
    SingleKnownSpeaker = "single_known_speaker",
}

/**
 * Options for a realtime translation session.
 *
 * `sourceLanguage` is required, and so is `targetLanguage` unless the source language is
 * {@link AUTOMATIC_SOURCE_LANGUAGE}; all other fields have server-side defaults. Language values
 * use IETF BCP-47 tags (e.g. `"en-US"`, `"de-DE"`).
 */
export interface ConnectOptions {
    mode?: RealtimeMode;
    /**
     * The language spoken into the session, or `"auto"` to have the server detect it (`slow`
     * mode). The server then reports each change as a `session.source_language_changed` event.
     */
    sourceLanguage: string;
    /**
     * The language to translate into. With an automatic source language it may be omitted: the
     * session then transcribes without translating until a target is set with
     * `session.updateLanguages(...)`.
     */
    targetLanguage?: string;
    /** Only with an automatic source language. See {@link SpeakerSetup}. */
    speakerSetup?: SpeakerSetup;
    /**
     * Only with an automatic source language: the languages detection may choose from (at most
     * 10). Naming the languages you expect makes detection faster and more accurate; when
     * omitted, every language the server can detect is considered.
     */
    sourceLanguageCandidates?: string[];
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
    mode: RealtimeMode;
    sourceLanguage: string;
    targetLanguage?: string;
    speakerSetup?: SpeakerSetup;
    sourceLanguageCandidates?: string[];
    outputModalities: OutputModality[];
    voiceId?: number;
}

export const DEFAULT_MODE: RealtimeMode = RealtimeMode.Fast;
export const DEFAULT_OUTPUT_MODALITIES: OutputModality[] = [
    OutputModality.Text,
    OutputModality.Audio,
];

/**
 * The retired engine codenames, each mapped onto the mode running the closest pipeline.
 *
 * `iris` was the only engine without a cold boot, so it becomes `Fast`; the rest become `Slow`.
 * Accepted rather than rejected so code written against the old `model` option keeps working — and
 * this matters more here than anywhere else, because an SDK consumer upgrades on their own
 * schedule, not ours.
 *
 * Mirrors `LEGACY_ENGINE_CODENAMES` in realtime-api-server's `protocol.rs` and
 * `LEGACY_REALTIME_ENGINE_CODENAMES` in the Python contract; all three must agree.
 */
export const LEGACY_ENGINE_CODENAMES: Readonly<Record<string, RealtimeMode>> = Object.freeze({
    iris: RealtimeMode.Fast,
    lilac: RealtimeMode.Slow,
    violet: RealtimeMode.Slow,
    orchid: RealtimeMode.Slow,
});

/**
 * Resolves a selector, accepting `fast`/`slow` and the retired codenames. Returns `undefined` for a
 * value that was never valid, so the caller can reject it — accepting the codenames must not
 * degrade into accepting anything.
 */
export function resolveMode(value: string): RealtimeMode | undefined {
    if ((Object.values(RealtimeMode) as string[]).includes(value)) {
        return value as RealtimeMode;
    }
    return LEGACY_ENGINE_CODENAMES[value];
}

/**
 * The retired `model` option, still read so pre-rename code keeps working.
 *
 * Declared as an interface extension rather than on {@link ConnectOptions} so the current shape
 * stays the one that shows up in editor completion, while a `model` key still type-checks for
 * anyone who has not migrated.
 */
export interface LegacyConnectOptions extends ConnectOptions {
    /** @deprecated Replaced by `mode`. `iris` maps to `fast`; `lilac`/`violet`/`orchid` to `slow`. */
    model?: string;
}

function warnDeprecated(message: string): void {
    // `console.warn` rather than a thrown error or a silent rewrite: the caller keeps working, and
    // the migration stays visible. Guarded because non-browser hosts can lack `console`.
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn(`[camb-ai] ${message}`);
    }
}

export function resolveOptions(opts: LegacyConnectOptions): ResolvedConnectOptions {
    // Warned about on being supplied, not on winning: a caller sending both is still shipping the
    // retired option. Matches the server-side shim, which keys off the same condition.
    if (opts.model !== undefined) {
        warnDeprecated(
            "The realtime `model` option is deprecated; use `mode` with 'fast' or 'slow'.",
        );
    }
    // `mode` wins when both are present — it is the option the caller migrated to.
    const selector = opts.mode ?? opts.model;
    let mode = DEFAULT_MODE;
    if (selector !== undefined) {
        const resolved = resolveMode(selector);
        if (resolved === undefined) {
            throw new TypeError(
                `Unsupported realtime mode \`${selector}\`: expected ` +
                    `${Object.values(RealtimeMode)
                        .map((value) => `'${value}'`)
                        .join(" or ")}`,
            );
        }
        if (resolved !== selector) {
            warnDeprecated(
                `The realtime engine codename '${selector}' is deprecated; use mode: '${resolved}'.`,
            );
        }
        mode = resolved;
    }
    const detectsSourceLanguage = opts.sourceLanguage === AUTOMATIC_SOURCE_LANGUAGE;
    if (!detectsSourceLanguage && !opts.targetLanguage) {
        throw new TypeError('targetLanguage is required unless sourceLanguage is "auto"');
    }
    if (
        !detectsSourceLanguage &&
        (opts.speakerSetup !== undefined || opts.sourceLanguageCandidates !== undefined)
    ) {
        throw new TypeError(
            'speakerSetup and sourceLanguageCandidates only apply when sourceLanguage is "auto"',
        );
    }
    return {
        mode,
        sourceLanguage: opts.sourceLanguage,
        targetLanguage: opts.targetLanguage,
        speakerSetup: opts.speakerSetup,
        sourceLanguageCandidates: opts.sourceLanguageCandidates,
        outputModalities: opts.outputModalities ?? DEFAULT_OUTPUT_MODALITIES,
        voiceId: opts.voiceId,
    };
}

/** Query-string parameters sent on the WebSocket upgrade URL. */
export function toQuery(opts: ResolvedConnectOptions): URLSearchParams {
    const params = new URLSearchParams();
    params.set("mode", opts.mode);
    return params;
}

/** Body of the `session.update` message sent after the WS handshake. */
export function toSessionPayload(opts: ResolvedConnectOptions): Record<string, unknown> {
    const session: Record<string, unknown> = {
        mode: opts.mode,
        source_language: opts.sourceLanguage,
        output_modalities: opts.outputModalities,
    };
    if (opts.targetLanguage) {
        session.target_language = opts.targetLanguage;
    }
    if (opts.speakerSetup !== undefined) {
        session.speaker_setup = opts.speakerSetup;
    }
    if (opts.sourceLanguageCandidates !== undefined) {
        session.source_language_candidates = [...opts.sourceLanguageCandidates];
    }
    if (opts.voiceId !== undefined) {
        session.voice = { type: "cloned", voice_id: opts.voiceId };
    }
    return session;
}
