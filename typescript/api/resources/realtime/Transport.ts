import { RealtimeConnectError } from "./errors.js";

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

function isJsonText(raw: unknown): raw is string {
    if (typeof raw !== "string") return false;
    const head = raw.trimStart();
    return head.startsWith("{") || head.startsWith("[");
}

function toBytes(raw: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
    return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}

export interface Transport {
    connect(url: string, headers: Record<string, string>): Promise<void>;
    sendBytes(data: ArrayBuffer | Uint8Array): Promise<void>;
    sendText(data: string): Promise<void>;
    onMessage(handler: (data: string | Uint8Array) => void): void;
    onClose(handler: (code: number, reason: string) => void): void;
    onError(handler: (err: Error) => void): void;
    close(code?: number): Promise<void>;
}

/**
 * Default transport built on the platform `WebSocket`.
 *
 * Realtime auth is carried inside the `session.update` JSON message rather
 * than an HTTP header, so this transport runs identically in browsers and
 * Node without needing the `ws` package. We still keep the `headers`
 * argument for parity with the live_transcription transport — Node uses it
 * when callers supply custom headers; browsers ignore it.
 */
export class WebSocketTransport implements Transport {
    private ws?: WebSocket;
    private readonly onMessageHandlers: Array<(data: string | Uint8Array) => void> = [];
    private readonly onCloseHandlers: Array<(code: number, reason: string) => void> = [];
    private readonly onErrorHandlers: Array<(err: Error) => void> = [];

    async connect(url: string, headers: Record<string, string>): Promise<void> {
        const isBrowser =
            typeof globalThis !== "undefined" &&
            typeof (globalThis as any).window !== "undefined";

        if (isBrowser || Object.keys(headers).length === 0) {
            const WSCtor: typeof WebSocket | undefined =
                (globalThis as any).WebSocket;
            if (!WSCtor) {
                throw new RealtimeConnectError(
                    "Global WebSocket is unavailable in this environment.",
                );
            }
            this.ws = new WSCtor(url);
        } else {
            // Node with custom headers: built-in WebSocket can't set them on
            // the upgrade. Fall back to the `ws` package when present.
            let WsLib: any;
            try {
                WsLib = (await import("ws" as any)).default ?? (await import("ws" as any));
            } catch {
                const WSCtor: typeof WebSocket | undefined =
                    (globalThis as any).WebSocket;
                if (!WSCtor) {
                    throw new RealtimeConnectError(
                        "Global WebSocket is unavailable; install the `ws` package for header support.",
                    );
                }
                this.ws = new WSCtor(url);
            }
            if (WsLib) {
                this.ws = new WsLib(url, { headers }) as unknown as WebSocket;
            }
        }

        (this.ws as any).binaryType = "arraybuffer";

        // IMPORTANT: attach data listeners BEFORE awaiting `open`. With the
        // `ws` package, frames arriving immediately after the handshake are
        // dropped if no listener is registered.
        this.addListener("message", (data: any) => {
            // `ws` emits Buffer for binary or string for text; the browser
            // wraps payloads in a MessageEvent under `.data`. Normalize both.
            const raw = data?.data !== undefined ? data.data : data;
            if (typeof raw === "string") {
                for (const handler of this.onMessageHandlers) handler(raw);
                return;
            }
            if (raw instanceof ArrayBuffer) {
                // `ws` text frames arrive as Uint8Array under binaryType
                // = "arraybuffer". Distinguish JSON text from binary PCM by
                // sniffing the first non-whitespace byte; '{' opens a JSON
                // object, anything else is treated as PCM.
                const view = new Uint8Array(raw);
                const text = decodeUtf8(view);
                if (isJsonText(text)) {
                    for (const handler of this.onMessageHandlers) handler(text);
                } else {
                    for (const handler of this.onMessageHandlers) handler(view);
                }
                return;
            }
            if (raw && typeof raw === "object" && typeof (raw as ArrayBufferView).byteLength === "number") {
                const view = toBytes(raw as ArrayBufferView);
                const text = decodeUtf8(view);
                if (isJsonText(text)) {
                    for (const handler of this.onMessageHandlers) handler(text);
                } else {
                    for (const handler of this.onMessageHandlers) handler(view);
                }
                return;
            }
        });
        this.addListener("close", (codeOrEvent: any, reason?: any) => {
            const code = typeof codeOrEvent === "number" ? codeOrEvent : codeOrEvent?.code ?? 1006;
            const rawReason =
                typeof reason === "string" || (reason && reason.length !== undefined)
                    ? reason
                    : codeOrEvent?.reason;
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
                reject(new RealtimeConnectError("WebSocket failed to initialize"));
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
                    new RealtimeConnectError(
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
        if (!this.ws) throw new RealtimeConnectError("Not connected");
        this.ws.send(data as any);
    }

    async sendText(data: string): Promise<void> {
        if (!this.ws) throw new RealtimeConnectError("Not connected");
        this.ws.send(data);
    }

    onMessage(handler: (data: string | Uint8Array) => void): void {
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
