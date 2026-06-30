import * as core from "../../../core/index.js";
import { LiveTranscriptionConnectError } from "./errors.js";
import { LiveTranscriptionSession } from "./LiveTranscriptionSession.js";
import { ConnectOptions, resolveOptions, toQuery } from "./options.js";
import { Transport, WebSocketTransport } from "./Transport.js";

export interface LiveTranscriptionClientOptions {
    apiKey?: core.Supplier<string>;
    environment?: core.Supplier<string>;
    baseUrl?: core.Supplier<string>;
    headers?: Record<string, string>;
    /** Inject a transport (e.g. for tests). */
    transport?: () => Transport;
}

// Live transcription runs on the dedicated realtime host, independent of the
// REST API environment. Mirrors realtime's DEFAULT_REALTIME_BASE_URL.
export const DEFAULT_LIVE_TRANSCRIPTION_BASE_URL = "wss://realtime.camb.ai";
const LIVE_TRANSCRIPTION_PATH = "/streaming-transcription/listen";

function isBrowser(): boolean {
    return typeof globalThis !== "undefined" && typeof (globalThis as any).window !== "undefined";
}

function httpToWs(url: string): string {
    if (url.startsWith("https://")) return "wss://" + url.slice("https://".length);
    if (url.startsWith("http://")) return "ws://" + url.slice("http://".length);
    return url;
}

export class LiveTranscriptionClient {
    constructor(private readonly options: LiveTranscriptionClientOptions) {}

    async connect(opts: ConnectOptions = {}): Promise<LiveTranscriptionSession> {
        const apiKey =
            opts.apiKey ??
            (this.options.apiKey
                ? await core.Supplier.get(this.options.apiKey)
                : undefined);
        if (!apiKey) {
            throw new LiveTranscriptionConnectError(
                "No API key configured; provide one when constructing the client or via ConnectOptions.apiKey.",
            );
        }

        const baseHttpUrl =
            opts.baseUrl ??
            (this.options.baseUrl
                ? await core.Supplier.get(this.options.baseUrl)
                : undefined) ??
            (this.options.environment
                ? await core.Supplier.get(this.options.environment)
                : undefined) ??
            DEFAULT_LIVE_TRANSCRIPTION_BASE_URL;

        const resolved = resolveOptions(opts);
        const query = toQuery(resolved);

        const wsBase = httpToWs(baseHttpUrl).replace(/\/$/, "");
        const headers: Record<string, string> = {
            ...(this.options.headers ?? {}),
        };

        // Browsers can't set headers on a WebSocket upgrade. Fall through to
        // a query-string token so the server can still authenticate the
        // connection without forcing users to proxy the request.
        if (isBrowser()) {
            query.set("x_api_key", apiKey);
        } else {
            headers["x-api-key"] = apiKey;
        }

        const url = `${wsBase}${LIVE_TRANSCRIPTION_PATH}?${query.toString()}`;

        const transport = this.options.transport
            ? this.options.transport()
            : new WebSocketTransport();

        // Attach the session's handlers BEFORE the transport connects so
        // immediate post-handshake frames (e.g. Ready) are not dropped.
        const session = new LiveTranscriptionSession(transport);
        await session._attach();
        await transport.connect(url, headers);
        return session;
    }
}
