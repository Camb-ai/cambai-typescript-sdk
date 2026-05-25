import { LiveTranscriptionConnectError } from "./errors.js";

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
        const WS: typeof WebSocket | undefined = (globalThis as any).WebSocket;
        if (!WS) {
            throw new LiveTranscriptionConnectError(
                "Global WebSocket is unavailable. Requires Node 18+ or a browser environment.",
            );
        }
        // Node's WebSocket implementation accepts headers via a non-standard
        // `headers` option in the third arg; browsers ignore it. The Node
        // global accepts both ways depending on version.
        const optionsArg: any = { headers };
        try {
            // Some platforms expose a 3-arg constructor that ignores extras.
            this.ws = new (WS as any)(url, undefined, optionsArg) as WebSocket;
        } catch {
            this.ws = new WS(url);
        }

        this.ws.binaryType = "arraybuffer";

        await new Promise<void>((resolve, reject) => {
            if (!this.ws) {
                reject(new LiveTranscriptionConnectError("WebSocket failed to initialize"));
                return;
            }
            const onOpen = () => {
                this.ws?.removeEventListener("open", onOpen);
                this.ws?.removeEventListener("error", onErrorOnce);
                resolve();
            };
            const onErrorOnce = (event: Event) => {
                this.ws?.removeEventListener("open", onOpen);
                this.ws?.removeEventListener("error", onErrorOnce);
                reject(new LiveTranscriptionConnectError(`WebSocket connect failed: ${String((event as any)?.message ?? event?.type ?? "error")}`));
            };
            this.ws.addEventListener("open", onOpen);
            this.ws.addEventListener("error", onErrorOnce);
        });

        this.ws.addEventListener("message", (event: MessageEvent) => {
            for (const handler of this.onMessageHandlers) {
                handler(event.data as string | ArrayBuffer);
            }
        });
        this.ws.addEventListener("close", (event: CloseEvent) => {
            for (const handler of this.onCloseHandlers) {
                handler(event.code, event.reason ?? "");
            }
        });
        this.ws.addEventListener("error", (event: Event) => {
            const err = new Error(String((event as any)?.message ?? "WebSocket error"));
            for (const handler of this.onErrorHandlers) {
                handler(err);
            }
        });
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
