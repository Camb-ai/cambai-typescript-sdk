export enum Encoding {
    Linear16 = "linear16",
    Linear32 = "linear32",
    ALaw = "alaw",
    MuLaw = "mulaw",
}

/**
 * Query-string options sent on the WebSocket upgrade.
 *
 * Every field is optional. Defaults match the server defaults documented
 * in `public_docs/api-reference/websockets/asyncapi.json` — omit any to
 * inherit the server default.
 */
export interface ConnectOptions {
    model?: string;
    language?: string;
    encoding?: Encoding;
    sampleRate?: number;
    channels?: number;
    /** Override the WebSocket base URL (e.g. for staging). */
    baseUrl?: string;
    /** Override the API key resolved from the parent client. */
    apiKey?: string;
}

export type ResolvedConnectOptions = Required<Omit<ConnectOptions, "baseUrl" | "apiKey">>;

export const DEFAULT_OPTIONS: ResolvedConnectOptions = {
    model: "boli-v5",
    language: "en-us",
    encoding: Encoding.Linear16,
    sampleRate: 16000,
    channels: 1,
};

export function resolveOptions(opts?: ConnectOptions): ResolvedConnectOptions {
    return { ...DEFAULT_OPTIONS, ...(opts ?? {}) };
}

export function toQuery(opts: ResolvedConnectOptions): URLSearchParams {
    const params = new URLSearchParams();
    params.set("model", opts.model);
    params.set("language", opts.language);
    params.set("encoding", opts.encoding);
    params.set("sample_rate", String(opts.sampleRate));
    params.set("channels", String(opts.channels));
    return params;
}
