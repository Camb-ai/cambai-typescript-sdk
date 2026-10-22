/**
 * Automatic source language detection and the session pair that links a call's two directions.
 *
 * The server is faked at the transport: each test pushes the JSON events the realtime server would
 * send and inspects the client events the SDK sent back.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    RealtimeClient,
    RealtimeMode,
    ServerEventType,
    SpeakerSetup,
    Transport,
    resolveOptions,
    toSessionPayload,
} from "../../typescript/api/resources/realtime/index.js";

type ClientEvent = Record<string, any>;

class FakeServerTransport implements Transport {
    readonly sentEvents: ClientEvent[] = [];
    closeCode: number | undefined;
    private messageHandlers: Array<(data: string | Uint8Array) => void> = [];
    private closeHandlers: Array<(code: number, reason: string) => void> = [];

    constructor(private readonly refuseToConnect = false) {}

    async connect(): Promise<void> {
        if (this.refuseToConnect) throw new Error("refused");
    }
    async sendBytes(): Promise<void> {
        throw new Error("the SDK sends audio as JSON text");
    }
    async sendText(data: string): Promise<void> {
        this.sentEvents.push(JSON.parse(data));
    }
    onMessage(handler: (data: string | Uint8Array) => void): void {
        this.messageHandlers.push(handler);
    }
    onClose(handler: (code: number, reason: string) => void): void {
        this.closeHandlers.push(handler);
    }
    onError(): void {}
    async close(code = 1000): Promise<void> {
        this.closeCode = code;
        for (const handler of this.closeHandlers) handler(code, "");
    }

    sendServerEvent(event: Record<string, unknown>): void {
        for (const handler of this.messageHandlers) handler(JSON.stringify(event));
    }

    sessionUpdatesAfterTheFirst(): ClientEvent[] {
        return this.sentEvents
            .slice(1)
            .filter((event) => event.type === "session.update")
            .map((event) => event.session);
    }
}

function sessionCreated(sourceLanguage = "auto", targetLanguage = ""): Record<string, unknown> {
    return {
        type: "session.created",
        session: {
            id: "session-id",
            mode: "slow",
            source_language: sourceLanguage,
            target_language: targetLanguage,
            output_modalities: ["text", "audio"],
        },
    };
}

function sourceLanguageChanged(language: string, previousLanguage?: string): Record<string, unknown> {
    return { type: "session.source_language_changed", language, previous_language: previousLanguage };
}

async function letEventsArrive(): Promise<void> {
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
}

function clientWithTransports(): { client: RealtimeClient; transports: FakeServerTransport[] } {
    const transports: FakeServerTransport[] = [];
    const client = new RealtimeClient({
        apiKey: "test-api-key",
        transport: () => {
            const transport = new FakeServerTransport();
            transports.push(transport);
            return transport;
        },
    });
    return { client, transports };
}

describe("connect options", () => {
    it("lets an automatic source language omit the target", () => {
        const payload = toSessionPayload(
            resolveOptions({
                mode: RealtimeMode.Slow,
                sourceLanguage: "auto",
                speakerSetup: SpeakerSetup.SingleKnownSpeaker,
                sourceLanguageCandidates: ["en-US", "de-DE"],
            }),
        );
        assert.deepEqual(payload, {
            mode: "slow",
            source_language: "auto",
            output_modalities: ["text", "audio"],
            speaker_setup: "single_known_speaker",
            source_language_candidates: ["en-US", "de-DE"],
        });
    });

    it("still requires a target for an explicit source language", () => {
        assert.throws(() => resolveOptions({ sourceLanguage: "en-US" }), /targetLanguage is required/);
        assert.throws(
            () =>
                resolveOptions({
                    sourceLanguage: "en-US",
                    targetLanguage: "de-DE",
                    speakerSetup: SpeakerSetup.ChangingSpeakers,
                }),
            /only apply/,
        );
    });

    it("sends explicit languages exactly as before", () => {
        assert.deepEqual(toSessionPayload(resolveOptions({ sourceLanguage: "en-US", targetLanguage: "de-DE" })), {
            mode: "fast",
            source_language: "en-US",
            target_language: "de-DE",
            output_modalities: ["text", "audio"],
        });
    });
});

describe("a session with an automatic source language", () => {
    it("parses the language events and sends language changes", async () => {
        const { client, transports } = clientWithTransports();
        const session = await client.connect({ mode: RealtimeMode.Slow, sourceLanguage: "auto" });
        const [transport] = transports;
        const changes: Array<[string, string | undefined]> = [];
        const transcripts: Array<[string | undefined, string | undefined, boolean | undefined]> = [];
        const errorCodes: Array<[string | undefined, string | undefined, string | undefined]> = [];
        session.on(ServerEventType.SourceLanguageChanged, (event) => {
            changes.push([event.language, event.previousLanguage]);
        });
        session.on(ServerEventType.TranscriptCompleted, (event) => {
            transcripts.push([event.itemId, event.language, event.passthrough]);
        });
        session.on(ServerEventType.Error, (event) => {
            errorCodes.push([event.code, event.errorType, event.param]);
        });

        transport!.sendServerEvent(sessionCreated());
        transport!.sendServerEvent(sourceLanguageChanged("de-DE"));
        transport!.sendServerEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "Guten Tag",
            item_id: "item-1",
            language: "de-DE",
            passthrough: false,
        });
        transport!.sendServerEvent({
            type: "error",
            error: {
                type: "invalid_request_error",
                code: "target_language_unsupported_for_mode",
                message: "unsupported",
                param: "session.target_language",
            },
        });
        await session.waitUntilReady();
        await letEventsArrive();

        await session.updateLanguages({ targetLanguage: "en-US" });
        await session.updateLanguages({ sourceLanguage: "de-DE" });
        await session.ignoreUtteranceForLanguageDetection("item-1");
        await assert.rejects(session.updateLanguages({}), TypeError);

        assert.deepEqual(changes, [["de-DE", undefined]]);
        assert.deepEqual(transcripts, [["item-1", "de-DE", false]]);
        assert.deepEqual(errorCodes, [
            ["target_language_unsupported_for_mode", "invalid_request_error", "session.target_language"],
        ]);
        assert.deepEqual(transport!.sentEvents.slice(1), [
            { type: "session.update", session: { target_language: "en-US" } },
            { type: "session.update", session: { source_language: "de-DE" } },
            { type: "input_audio_buffer.ignore_for_language_detection", item_id: "item-1" },
        ]);
    });
});

describe("a session pair", () => {
    it("has each direction translate into the language the other one speaks", async () => {
        const { client, transports } = clientWithTransports();
        const pair = await client.connectSessionPair({ mode: RealtimeMode.Slow });
        const [local, other] = transports;
        assert.equal(local!.sentEvents[0]!.session.speaker_setup, "single_known_speaker");
        assert.equal(other!.sentEvents[0]!.session.speaker_setup, "changing_speakers");
        assert.equal(local!.sentEvents[0]!.session.source_language, "auto");

        local!.sendServerEvent(sessionCreated());
        other!.sendServerEvent(sessionCreated());
        await pair.waitUntilReady();
        other!.sendServerEvent(sourceLanguageChanged("de-DE"));
        local!.sendServerEvent(sourceLanguageChanged("en-US"));
        await letEventsArrive();
        assert.deepEqual(local!.sessionUpdatesAfterTheFirst(), [{ target_language: "de-DE" }]);
        assert.deepEqual(other!.sessionUpdatesAfterTheFirst(), [{ target_language: "en-US" }]);

        // The same language again changes nothing; a new one is passed on.
        local!.sendServerEvent(sourceLanguageChanged("en-US", "en-US"));
        other!.sendServerEvent(sourceLanguageChanged("fr-FR", "de-DE"));
        await letEventsArrive();
        assert.deepEqual(other!.sessionUpdatesAfterTheFirst(), [{ target_language: "en-US" }]);
        assert.deepEqual(local!.sessionUpdatesAfterTheFirst(), [
            { target_language: "de-DE" },
            { target_language: "fr-FR" },
        ]);
        await pair.close();
    });

    it("passes on a language detected before the other session was ready, once it is", async () => {
        const { client, transports } = clientWithTransports();
        const pair = await client.connectSessionPair({ mode: RealtimeMode.Slow });
        const [local, other] = transports;
        other!.sendServerEvent(sessionCreated());
        other!.sendServerEvent(sourceLanguageChanged("de-DE"));
        await letEventsArrive();
        assert.deepEqual(local!.sessionUpdatesAfterTheFirst(), []);

        local!.sendServerEvent(sessionCreated());
        await letEventsArrive();
        assert.deepEqual(local!.sessionUpdatesAfterTheFirst(), [{ target_language: "de-DE" }]);
        await pair.close();
    });

    it("uses a fixed source language as the other direction's target", async () => {
        const { client, transports } = clientWithTransports();
        const pair = await client.connectSessionPair({
            mode: RealtimeMode.Slow,
            localSpeaker: { sourceLanguage: "en-US", targetLanguage: "de-DE" },
        });
        const [local, other] = transports;
        assert.equal(local!.sentEvents[0]!.session.speaker_setup, undefined);
        local!.sendServerEvent(sessionCreated("en-US", "de-DE"));
        other!.sendServerEvent(sessionCreated());
        await letEventsArrive();
        assert.deepEqual(other!.sessionUpdatesAfterTheFirst(), [{ target_language: "en-US" }]);
        await pair.close();
    });

    it("leaves a switch confirmation request to the application", async () => {
        const { client, transports } = clientWithTransports();
        const pair = await client.connectSessionPair({ mode: RealtimeMode.Slow });
        const [local, other] = transports;
        const confirmationRequests: string[] = [];
        pair.localSpeakerSession.on(ServerEventType.SourceLanguageSwitchConfirmationRequested, (event) => {
            confirmationRequests.push(event.language);
        });
        local!.sendServerEvent(sessionCreated());
        other!.sendServerEvent(sessionCreated());
        local!.sendServerEvent({
            type: "session.source_language_switch_confirmation_requested",
            language: "de-DE",
        });
        await letEventsArrive();
        assert.deepEqual(confirmationRequests, ["de-DE"]);
        assert.deepEqual(other!.sessionUpdatesAfterTheFirst(), []);
        await pair.close();
    });

    it("closes both sessions when one fails to open", async () => {
        const transports: FakeServerTransport[] = [];
        const client = new RealtimeClient({
            apiKey: "test-api-key",
            transport: () => {
                const transport = new FakeServerTransport(transports.length === 1);
                transports.push(transport);
                return transport;
            },
        });
        await assert.rejects(client.connectSessionPair({ mode: RealtimeMode.Slow }), /refused/);
        assert.equal(transports[0]!.closeCode, 1000);
    });
});
