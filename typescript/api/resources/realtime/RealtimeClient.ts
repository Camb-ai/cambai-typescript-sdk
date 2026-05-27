import * as core from "../../../core/index.js";
import { RealtimeConnectError } from "./errors.js";
import { ConnectOptions, resolveOptions, toQuery, toSessionPayload } from "./options.js";
import { RealtimeSession } from "./RealtimeSession.js";
import { Transport, WebSocketTransport } from "./Transport.js";

export interface RealtimeClientOptions {
    apiKey?: core.Supplier<string>;
    /** Default WebSocket base URL — overridable per-connect via `ConnectOptions.baseUrl`. */
    baseUrl?: core.Supplier<string>;
    headers?: Record<string, string>;
    /** Inject a transport (e.g. for tests). */
    transport?: () => Transport;
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

    async connect(opts: ConnectOptions): Promise<RealtimeSession> {
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
        await transport.connect(url, headers);
        // The server expects `session.update` immediately after the
        // handshake; sending here keeps `connect` ergonomic — callers just
        // await `session.waitUntilReady()` next.
        await session._sendSessionUpdate();
        return session;
    }
}
