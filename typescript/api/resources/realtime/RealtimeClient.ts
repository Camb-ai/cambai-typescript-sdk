import * as core from "../../../core/index.js";
import { RealtimeConnectError } from "./errors.js";
import {
    AUTOMATIC_SOURCE_LANGUAGE,
    ConnectOptions,
    LegacyConnectOptions,
    SpeakerSetup,
    resolveOptions,
    toQuery,
    toSessionPayload,
} from "./options.js";
import { RealtimeSession } from "./RealtimeSession.js";
import { RealtimeSessionPair } from "./RealtimeSessionPair.js";
import { Transport, WebSocketTransport } from "./Transport.js";

export interface RealtimeClientOptions {
    apiKey?: core.Supplier<string>;
    /** Default WebSocket base URL — overridable per-connect via `ConnectOptions.baseUrl`. */
    baseUrl?: core.Supplier<string>;
    headers?: Record<string, string>;
    /** Inject a transport (e.g. for tests). */
    transport?: () => Transport;
}

/**
 * Options for {@link RealtimeClient.connectSessionPair}. Top-level options (e.g. `mode`,
 * `outputModalities`) apply to both sessions; `localSpeaker` and `otherParty` override them per
 * direction (e.g. `voiceId`, `sourceLanguageCandidates`).
 */
export interface SessionPairConnectOptions extends Partial<LegacyConnectOptions> {
    localSpeaker?: Partial<ConnectOptions>;
    otherParty?: Partial<ConnectOptions>;
}

/** A session that is configured but not yet connected, so handlers can be registered first. */
interface UnopenedRealtimeSession {
    session: RealtimeSession;
    open: () => Promise<void>;
}

export const DEFAULT_REALTIME_BASE_URL = "wss://realtime.camb.ai";
const REALTIME_PATH = "/v1/realtime";

function httpToWs(url: string): string {
    if (url.startsWith("https://")) return "wss://" + url.slice("https://".length);
    if (url.startsWith("http://")) return "ws://" + url.slice("http://".length);
    return url;
}

/**
 * Entry point for the realtime speech translation WebSocket.
 *
 * Usage:
 *
 *     const client = new CambClient({ apiKey: "..." });
 *     const session = await client.realtime.connect({
 *         sourceLanguage: "en-US",
 *         targetLanguage: "de-DE",
 *     });
 *
 *     session.on(ServerEventType.AudioDelta, (event) => play(event.data));
 *     await session.waitUntilReady();
 *     await session.stream(microphone);
 */
export class RealtimeClient {
    constructor(private readonly options: RealtimeClientOptions) {}

    // Typed as `LegacyConnectOptions` so the retired `model` option still type-checks for
    // callers who have not migrated; `resolveOptions` maps it and warns.
    async connect(opts: LegacyConnectOptions): Promise<RealtimeSession> {
        const unopenedSession = await this.createSession(opts);
        await unopenedSession.open();
        return unopenedSession.session;
    }

    /**
     * Open both directions of a call, each translating into the language the other one speaks.
     *
     * Both sessions detect their source language unless given one, and whenever one changes it
     * becomes the other session's target language. The local speaker defaults to
     * `speakerSetup: "single_known_speaker"` and the other party to `"changing_speakers"`.
     *
     *     const pair = await client.realtime.connectSessionPair({ mode: RealtimeMode.Slow });
     *     await pair.waitUntilReady();
     *     await Promise.all([
     *         pair.localSpeakerSession.stream(microphone),
     *         pair.otherPartySession.stream(callAudio),
     *     ]);
     */
    async connectSessionPair(opts: SessionPairConnectOptions = {}): Promise<RealtimeSessionPair> {
        const { localSpeaker, otherParty, ...sharedOptions } = opts;
        const unopenedSessions = await Promise.all([
            this.createSession(
                directionOptions(sharedOptions, localSpeaker, SpeakerSetup.SingleKnownSpeaker),
            ),
            this.createSession(
                directionOptions(sharedOptions, otherParty, SpeakerSetup.ChangingSpeakers),
            ),
        ]);
        const sessionPair = new RealtimeSessionPair(
            unopenedSessions[0].session,
            unopenedSessions[1].session,
        );
        // Both opens settle before deciding, so a session still connecting when the other fails
        // cannot finish connecting after the pair was closed and leak its socket.
        const openResults = await Promise.allSettled(
            unopenedSessions.map((unopenedSession) => unopenedSession.open()),
        );
        const openFailure = openResults.find(
            (openResult): openResult is PromiseRejectedResult => openResult.status === "rejected",
        );
        if (openFailure !== undefined) {
            await sessionPair.close();
            throw openFailure.reason;
        }
        return sessionPair;
    }

    private async createSession(opts: LegacyConnectOptions): Promise<UnopenedRealtimeSession> {
        const apiKey =
            opts.apiKey ??
            (this.options.apiKey
                ? await core.Supplier.get(this.options.apiKey)
                : undefined);
        if (!apiKey) {
            throw new RealtimeConnectError(
                "No API key configured; provide one when constructing the client or via ConnectOptions.apiKey.",
            );
        }

        const baseUrl =
            opts.baseUrl ??
            (this.options.baseUrl
                ? await core.Supplier.get(this.options.baseUrl)
                : undefined) ??
            DEFAULT_REALTIME_BASE_URL;

        const resolved = resolveOptions(opts);
        const query = toQuery(resolved);
        const wsBase = httpToWs(baseUrl).replace(/\/$/, "");
        const url = `${wsBase}${REALTIME_PATH}?${query.toString()}`;

        const headers: Record<string, string> = { ...(this.options.headers ?? {}) };
        const sessionPayload = {
            type: "session.update",
            session: toSessionPayload(resolved),
            auth: { api_key: apiKey },
        };

        const transport = this.options.transport
            ? this.options.transport()
            : new WebSocketTransport();

        // Attach the session's handlers BEFORE the transport connects so
        // post-handshake frames are not dropped.
        const session = new RealtimeSession(transport, sessionPayload);
        await session._attach();
        return {
            session,
            open: async () => {
                await transport.connect(url, headers);
                // The server expects `session.update` immediately after the
                // handshake; sending here keeps `connect` ergonomic — callers just
                // await `session.waitUntilReady()` next.
                await session._sendSessionUpdate();
            },
        };
    }
}

function directionOptions(
    sharedOptions: Partial<LegacyConnectOptions>,
    direction: Partial<ConnectOptions> | undefined,
    defaultSpeakerSetup: SpeakerSetup,
): LegacyConnectOptions {
    const options: LegacyConnectOptions = {
        sourceLanguage: AUTOMATIC_SOURCE_LANGUAGE,
        ...sharedOptions,
        ...direction,
    };
    if (options.sourceLanguage === AUTOMATIC_SOURCE_LANGUAGE && options.speakerSetup === undefined) {
        options.speakerSetup = defaultSpeakerSetup;
    }
    return options;
}
