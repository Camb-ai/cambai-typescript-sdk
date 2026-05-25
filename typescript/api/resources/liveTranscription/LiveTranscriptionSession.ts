import type { AudioSource } from "./AudioSource.js";
import { LiveTranscriptionProtocolError } from "./errors.js";
import {
    PARSER_REGISTRY,
    ServerEventPayloads,
    ServerMessageType,
} from "./events.js";
import type { Transport } from "./Transport.js";

type Handler<T> = (payload: T) => void | Promise<void>;
type WildcardHandler = (
    event: ServerMessageType | string,
    payload: unknown,
) => void | Promise<void>;

/**
 * One live transcription connection.
 *
 * Construct via `LiveTranscriptionClient.connect`. Direct instantiation is
 * supported for tests; production code should go through the parent client
 * so URL/auth wiring stays consistent.
 */
export class LiveTranscriptionSession {
    private readonly handlers = new Map<ServerMessageType, Handler<unknown>[]>();
    private readonly wildcardHandlers: WildcardHandler[] = [];
    private _isReady = false;
    private _isClosed = false;
    private _readyResolve?: () => void;
    private readonly readyPromise: Promise<void>;
    private closedResolve?: () => void;
    private readonly closedPromise: Promise<void>;

    constructor(private readonly transport: Transport) {
        this.readyPromise = new Promise<void>((resolve) => {
            this._readyResolve = resolve;
        });
        this.closedPromise = new Promise<void>((resolve) => {
            this.closedResolve = resolve;
        });
    }

    /** @internal — called by `LiveTranscriptionClient.connect`. */
    async _attach(): Promise<void> {
        this.transport.onMessage((data) => this.handleFrame(data));
        this.transport.onClose((code, reason) => this.emitClose(code, reason));
        this.transport.onError(() => {
            // Transport-level errors are surfaced via Error event so user code
            // sees a single channel for both server-side and socket-level
            // failures.
            this.dispatch(ServerMessageType.Error, {
                type: ServerMessageType.Error,
                message: "WebSocket transport error",
                raw: null,
            });
        });
    }

    get isReady(): boolean {
        return this._isReady;
    }

    get isClosed(): boolean {
        return this._isClosed;
    }

    waitUntilReady(): Promise<void> {
        return this.readyPromise;
    }

    waitUntilClosed(): Promise<void> {
        return this.closedPromise;
    }

    on<T extends ServerMessageType>(
        event: T,
        handler: Handler<ServerEventPayloads[T]>,
    ): this {
        const list = this.handlers.get(event) ?? [];
        list.push(handler as Handler<unknown>);
        this.handlers.set(event, list);
        return this;
    }

    off<T extends ServerMessageType>(
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

    async sendAudio(chunk: ArrayBuffer | Uint8Array | Buffer): Promise<void> {
        const view: ArrayBuffer | Uint8Array =
            chunk instanceof ArrayBuffer ? chunk : (chunk as Uint8Array);
        await this.transport.sendBytes(view);
    }

    async keepAlive(): Promise<void> {
        await this.transport.sendText(JSON.stringify({ type: "KeepAlive" }));
    }

    async close(): Promise<void> {
        if (this._isClosed) return;
        try {
            await this.transport.sendText(JSON.stringify({ type: "CloseStream" }));
        } catch {
            // Transport may already be torn down; swallow and continue to
            // explicit close so callers always reach a terminal state.
        }
        await this.transport.close(1000);
    }

    async pipe(source: AudioSource): Promise<void> {
        try {
            for await (const chunk of source) {
                if (this._isClosed) break;
                await this.sendAudio(chunk);
            }
        } finally {
            await source.stop();
        }
    }

    // ---------------------------- internals --------------------------

    private handleFrame(data: string | ArrayBuffer): void {
        if (typeof data !== "string") return; // server emits JSON only
        let parsed: any;
        try {
            parsed = JSON.parse(data);
        } catch {
            return;
        }
        const wireType: string | undefined = parsed?.type;
        if (wireType === undefined) return;
        if ((Object.values(ServerMessageType) as string[]).includes(wireType)) {
            const event = wireType as ServerMessageType;
            const parser = PARSER_REGISTRY[event];
            try {
                const payload = parser(parsed);
                if (event === ServerMessageType.Ready) {
                    this._isReady = true;
                    this._readyResolve?.();
                }
                this.dispatch(event, payload);
            } catch (err) {
                this.dispatch(ServerMessageType.Error, {
                    type: ServerMessageType.Error,
                    code: "protocol_error",
                    message: (err as Error).message,
                    raw: parsed,
                });
                throw new LiveTranscriptionProtocolError((err as Error).message);
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
        this.dispatch(ServerMessageType.Closed, {
            type: ServerMessageType.Closed,
            code,
            reason,
        });
        this.closedResolve?.();
    }

    private dispatch<T extends ServerMessageType>(
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
            // listener should not kill the transcription session. Users
            // wanting to observe these should subscribe to Error.
        }
    }
}
