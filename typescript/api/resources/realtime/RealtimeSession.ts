import type { RealtimeAudioSource } from "./AudioSource.js";
import { RealtimeConnectError, RealtimeProtocolError } from "./errors.js";
import {
    AudioDeltaEvent,
    ClosedEvent,
    ErrorEvent,
    PARSER_REGISTRY,
    ServerEventPayloads,
    ServerEventType,
} from "./events.js";
import type { Transport } from "./Transport.js";

export const SESSION_READY_TIMEOUT_MS = 90_000;

type Handler<T> = (payload: T) => void | Promise<void>;
type WildcardHandler = (
    event: ServerEventType | string,
    payload: unknown,
) => void | Promise<void>;

function toBase64(data: Uint8Array): string {
    if (typeof Buffer !== "undefined") {
        return Buffer.from(data).toString("base64");
    }
    let binary = "";
    for (let i = 0; i < data.byteLength; i++) {
        binary += String.fromCharCode(data[i]!);
    }
    // btoa is defined in browsers; both branches above cover Node and DOM.
    return btoa(binary);
}

function fromBase64(data: string): Uint8Array {
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(data, "base64"));
    }
    const binary = atob(data);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

/**
 * One realtime translation connection.
 *
 * Construct via `RealtimeClient.connect`. Direct instantiation is supported
 * for tests; production code should go through the parent client so URL/auth
 * wiring stays consistent.
 */
export class RealtimeSession {
    private readonly handlers = new Map<ServerEventType, Handler<unknown>[]>();
    private readonly wildcardHandlers: WildcardHandler[] = [];
    private _isReady = false;
    private _isClosed = false;
    private _readyResolve?: () => void;
    private _readyReject?: (err: Error) => void;
    private readonly readyPromise: Promise<void>;
    private closedResolve?: () => void;
    private readonly closedPromise: Promise<void>;
    private attached = false;

    constructor(
        private readonly transport: Transport,
        private readonly sessionPayload: Record<string, unknown>,
    ) {
        this.readyPromise = new Promise<void>((resolve, reject) => {
            this._readyResolve = resolve;
            this._readyReject = reject;
        });
        // Avoid an unhandled-rejection warning if the user never awaits.
        this.readyPromise.catch(() => undefined);
        this.closedPromise = new Promise<void>((resolve) => {
            this.closedResolve = resolve;
        });
    }

    /** @internal — called by `RealtimeClient.connect` before opening the socket. */
    async _attach(): Promise<void> {
        // Idempotent: re-running _attach would register a second copy of
        // every handler and every server frame would dispatch twice.
        if (this.attached) return;
        this.attached = true;
        this.transport.onMessage((data) => this.handleFrame(data));
        this.transport.onClose((code, reason) => this.emitClose(code, reason));
        this.transport.onError(() => {
            this.dispatch(ServerEventType.Error, {
                type: ServerEventType.Error,
                message: "WebSocket transport error",
                raw: null,
            });
        });
    }

    /** @internal — sends `session.update` immediately after the handshake completes. */
    async _sendSessionUpdate(): Promise<void> {
        await this.transport.sendText(JSON.stringify(this.sessionPayload));
    }

    get isReady(): boolean {
        return this._isReady;
    }

    get isClosed(): boolean {
        return this._isClosed;
    }

    /**
     * Block until the server confirms the session is active.
     *
     * Non-iris models cold-boot for 30+ seconds; the server sends
     * `session.starting` during that window to signal it is still working.
     * Rejects with `RealtimeConnectError` if `timeoutMs` elapses or the
     * socket closes before `session.created` arrives.
     */
    async waitUntilReady(timeoutMs: number = SESSION_READY_TIMEOUT_MS): Promise<void> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<void>((_, reject) => {
            timer = setTimeout(() => {
                reject(
                    new RealtimeConnectError(
                        `Timed out waiting for session.created after ${timeoutMs}ms`,
                    ),
                );
            }, timeoutMs);
        });
        try {
            await Promise.race([this.readyPromise, timeout]);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }

    waitUntilClosed(): Promise<void> {
        return this.closedPromise;
    }

    on<T extends ServerEventType>(
        event: T,
        handler: Handler<ServerEventPayloads[T]>,
    ): this {
        const list = this.handlers.get(event) ?? [];
        list.push(handler as Handler<unknown>);
        this.handlers.set(event, list);
        return this;
    }

    off<T extends ServerEventType>(
        event: T,
        handler: Handler<ServerEventPayloads[T]>,
    ): this {
        const list = this.handlers.get(event);
        if (!list) return this;
        const idx = list.indexOf(handler as Handler<unknown>);
        if (idx >= 0) list.splice(idx, 1);
        return this;
    }

    /** Receive every event, including ones added in future server releases. */
    onAny(handler: WildcardHandler): this {
        this.wildcardHandlers.push(handler);
        return this;
    }

    /** Send a raw PCM chunk to the server as a base64-encoded audio append. */
    async sendAudio(chunk: ArrayBuffer | Uint8Array | Buffer): Promise<void> {
        const view: Uint8Array =
            chunk instanceof Uint8Array
                ? chunk
                : new Uint8Array(chunk as ArrayBuffer);
        if (view.byteLength === 0) return;
        const payload = JSON.stringify({
            type: "input_audio_buffer.append",
            audio: toBase64(view),
        });
        await this.transport.sendText(payload);
    }

    /**
     * Pump chunks from `source` into the session until it is exhausted.
     *
     * If `source` exposes a `stop()` method it is invoked on exit, making
     * the SDK's Microphone implementations drop-in compatible.
     */
    async stream(source: RealtimeAudioSource): Promise<void> {
        try {
            for await (const chunk of source) {
                if (this._isClosed) break;
                await this.sendAudio(chunk);
            }
        } finally {
            const stopFn = (source as { stop?: () => unknown }).stop;
            if (typeof stopFn === "function") {
                await stopFn.call(source);
            }
        }
    }

    async close(): Promise<void> {
        if (this._isClosed) return;
        await this.transport.close(1000);
    }

    // ---------------------------- internals --------------------------

    private handleFrame(data: string | Uint8Array): void {
        if (typeof data !== "string") {
            // Binary frame: raw PCM from the server (optimization path).
            const event: AudioDeltaEvent = {
                type: ServerEventType.AudioDelta,
                data,
            };
            this.dispatch(ServerEventType.AudioDelta, event);
            return;
        }
        let parsed: any;
        try {
            parsed = JSON.parse(data);
        } catch {
            return;
        }
        const wireType: string | undefined = parsed?.type;
        if (wireType === undefined) return;

        if (wireType === ServerEventType.AudioDelta) {
            // JSON audio delta: base64-decode the delta field into raw bytes.
            let bytes: Uint8Array;
            try {
                bytes = fromBase64(parsed.delta ?? "");
            } catch {
                bytes = new Uint8Array(0);
            }
            const event: AudioDeltaEvent = {
                type: ServerEventType.AudioDelta,
                data: bytes,
            };
            this.dispatch(ServerEventType.AudioDelta, event);
            return;
        }

        if (wireType === ServerEventType.Error) {
            // Wire format: {"type": "error", "error": {"message": "..."}}.
            // Flatten the nested object for the handler payload.
            const errorObj = parsed?.error ?? {};
            const event: ErrorEvent = {
                type: ServerEventType.Error,
                message: errorObj.message ?? "Unknown error",
                raw: parsed,
            };
            this.dispatch(ServerEventType.Error, event);
            return;
        }

        if ((Object.values(ServerEventType) as string[]).includes(wireType)) {
            const event = wireType as Exclude<
                ServerEventType,
                ServerEventType.AudioDelta | ServerEventType.Error
            >;
            const parser = PARSER_REGISTRY[event];
            try {
                const payload = parser(parsed);
                if (event === ServerEventType.SessionCreated && !this._isReady) {
                    this._isReady = true;
                    this._readyResolve?.();
                }
                this.dispatch(event, payload as ServerEventPayloads[typeof event]);
            } catch (err) {
                this.dispatch(ServerEventType.Error, {
                    type: ServerEventType.Error,
                    message: (err as Error).message,
                    raw: parsed,
                });
                throw new RealtimeProtocolError((err as Error).message);
            }
        } else {
            // Unknown event type — still surfaced through onAny for
            // forward-compatibility with newer servers.
            for (const handler of this.wildcardHandlers) {
                void this.safeCall(() => handler(wireType, parsed));
            }
        }
    }

    private emitClose(code: number, reason: string): void {
        if (this._isClosed) return;
        this._isClosed = true;
        if (!this._isReady) {
            // Unblock waitUntilReady so callers fail fast if the socket
            // dies before the session ever became ready.
            this._isReady = true;
            this._readyReject?.(
                new RealtimeConnectError(
                    `WebSocket closed before the session became ready: code=${code} reason=${reason}`,
                ),
            );
        }
        const event: ClosedEvent = {
            type: ServerEventType.Closed,
            code,
            reason,
        };
        this.dispatch(ServerEventType.Closed, event);
        this.closedResolve?.();
    }

    private dispatch<T extends ServerEventType>(
        event: T,
        payload: ServerEventPayloads[T],
    ): void {
        for (const handler of this.handlers.get(event) ?? []) {
            void this.safeCall(() => (handler as Handler<unknown>)(payload));
        }
        for (const handler of this.wildcardHandlers) {
            void this.safeCall(() => handler(event, payload));
        }
    }

    private async safeCall(fn: () => void | Promise<void>): Promise<void> {
        try {
            await fn();
        } catch {
            // Handler errors are intentionally swallowed: a single bad
            // listener should not kill the session. Subscribe to Error to
            // observe these.
        }
    }
}
