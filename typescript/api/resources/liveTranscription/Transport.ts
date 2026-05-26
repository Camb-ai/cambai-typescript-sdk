import { LiveTranscriptionConnectError } from "./errors.js";

function decodeMessagePayload(raw: unknown): string | ArrayBuffer {
    if (typeof raw === "string") {
        return raw;
    }
    if (raw instanceof ArrayBuffer) {
        return decodeUtf8(raw);
    }
    if (raw && typeof raw === "object" && typeof (raw as ArrayBufferView).byteLength === "number") {
        // With `binaryType = "arraybuffer"`, the `ws` package delivers text
        // frames as Uint8Array. `String(uint8array)` yields comma-separated
        // byte codes, not JSON — decode as UTF-8 instead.
        return decodeUtf8(raw as ArrayBufferView);
    }
    return String(raw);
}

function decodeUtf8(raw: ArrayBuffer | ArrayBufferView): string {
    if (typeof TextDecoder !== "undefined") {
        return new TextDecoder().decode(raw);
    }
    const view =
        raw instanceof ArrayBuffer
            ? new Uint8Array(raw)
            : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    return Buffer.from(view).toString("utf8");
}

export interface Transport {
    connect(url: string, headers: Record<string, string>): Promise<void>;
    sendBytes(data: ArrayBuffer | Uint8Array): Promise<void>;
    sendText(data: string): Promise<void>;
    onMessage(handler: (data: string | ArrayBuffer) => void): void;
    onClose(handler: (code: number, reason: string) => void): void;
    onError(handler: (err: Error) => void): void;
    close(code?: number): Promise<void>;
}

/**
 * Default transport built on the platform `WebSocket`.
 *
 * Browsers always have `WebSocket`; Node provides it on `globalThis`
 * from v18 onward. The transport never imports the `ws` package, so
 * users get zero extra dependencies.
 *
 * Browsers ignore the `headers` argument because the `WebSocket`
 * constructor does not allow custom headers. The session falls back to
 * passing the API key as a query parameter in browser environments.
 */
export class WebSocketTransport implements Transport {
    private ws?: WebSocket;
    private readonly onMessageHandlers: Array<(data: string | ArrayBuffer) => void> = [];
    private readonly onCloseHandlers: Array<(code: number, reason: string) => void> = [];
    private readonly onErrorHandlers: Array<(err: Error) => void> = [];

    async connect(url: string, headers: Record<string, string>): Promise<void> {
        const isBrowser =
            typeof globalThis !== "undefined" &&
            typeof (globalThis as any).window !== "undefined";

        // Browsers cannot set custom headers on a WebSocket upgrade. Use the
        // platform WebSocket directly; the session falls back to a query
        // string for auth.
        if (isBrowser) {
            const WSCtor: typeof WebSocket | undefined = (globalThis as any).WebSocket;
            if (!WSCtor) {
                throw new LiveTranscriptionConnectError(
                    "Global WebSocket is unavailable in this browser environment.",
                );
            }
            this.ws = new WSCtor(url);
        } else {
            // Node: the built-in `WebSocket` global (Node 22+) does not accept
            // custom headers on the upgrade, which the server requires for
            // `x-api-key`. Prefer the `ws` package if installed; users who
            // skip it (e.g. browser-only bundles) still get a usable client.
            let WsLib: any;
            try {
                WsLib = (await import("ws" as any)).default ?? (await import("ws" as any));
            } catch {
                throw new LiveTranscriptionConnectError(
                    "On Node the `ws` package is required for header-based auth. " +
                        "Install it: npm install ws",
                );
            }
            this.ws = new WsLib(url, { headers }) as unknown as WebSocket;
        }

        (this.ws as any).binaryType = "arraybuffer";

        // IMPORTANT: attach data listeners BEFORE awaiting `open`. With the
        // `ws` package, frames arriving immediately after the handshake are
        // dropped if no listener is registered.
        this.addListener("message", (data: any) => {
            // `ws` emits Buffer for binary or string for text. The browser API
            // wraps payloads in a MessageEvent under `.data`. Normalize both.
            const raw = data?.data !== undefined ? data.data : data;
            const payload = decodeMessagePayload(raw);
            for (const handler of this.onMessageHandlers) {
                handler(payload);
            }
        });
        this.addListener("close", (codeOrEvent: any, reason?: any) => {
            const code = typeof codeOrEvent === "number" ? codeOrEvent : codeOrEvent?.code ?? 1006;
            const rawReason = typeof reason === "string" || (reason && reason.length !== undefined) ? reason : codeOrEvent?.reason;
            const r =
                typeof rawReason === "string"
                    ? rawReason
                    : rawReason && typeof rawReason.toString === "function"
                      ? rawReason.toString()
                      : "";
            for (const handler of this.onCloseHandlers) {
                handler(code, r);
            }
        });
        this.addListener("error", (event: any) => {
            const err = new Error(String(event?.message ?? "WebSocket error"));
            for (const handler of this.onErrorHandlers) {
                handler(err);
            }
        });

        await new Promise<void>((resolve, reject) => {
            if (!this.ws) {
                reject(new LiveTranscriptionConnectError("WebSocket failed to initialize"));
                return;
            }
            const onOpen = () => {
                this.removeListener("open", onOpen);
                this.removeListener("error", onErrorOnce);
                resolve();
            };
            const onErrorOnce = (event: any) => {
                this.removeListener("open", onOpen);
                this.removeListener("error", onErrorOnce);
                reject(
                    new LiveTranscriptionConnectError(
                        `WebSocket connect failed: ${String(event?.message ?? event?.type ?? event ?? "error")}`,
                    ),
                );
            };
            this.addListener("open", onOpen);
            this.addListener("error", onErrorOnce);
        });
    }

    /** Unified event subscribe for both `ws` (Node) and the browser API. */
    private addListener(event: string, fn: (...args: any[]) => void): void {
        const target: any = this.ws;
        if (!target) return;
        if (typeof target.on === "function") {
            target.on(event, fn);
        } else if (typeof target.addEventListener === "function") {
            target.addEventListener(event, fn as any);
        }
    }

    private removeListener(event: string, fn: (...args: any[]) => void): void {
        const target: any = this.ws;
        if (!target) return;
        if (typeof target.off === "function") {
            target.off(event, fn);
        } else if (typeof target.removeEventListener === "function") {
            target.removeEventListener(event, fn as any);
        }
    }

    async sendBytes(data: ArrayBuffer | Uint8Array): Promise<void> {
        if (!this.ws) throw new LiveTranscriptionConnectError("Not connected");
        this.ws.send(data as any);
    }

    async sendText(data: string): Promise<void> {
        if (!this.ws) throw new LiveTranscriptionConnectError("Not connected");
        this.ws.send(data);
    }

    onMessage(handler: (data: string | ArrayBuffer) => void): void {
        this.onMessageHandlers.push(handler);
    }

    onClose(handler: (code: number, reason: string) => void): void {
        this.onCloseHandlers.push(handler);
    }

    onError(handler: (err: Error) => void): void {
        this.onErrorHandlers.push(handler);
    }

    async close(code = 1000): Promise<void> {
        this.ws?.close(code);
    }
}
