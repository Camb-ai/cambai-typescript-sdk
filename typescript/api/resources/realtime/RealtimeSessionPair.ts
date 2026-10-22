import {
    ServerEventType,
    SessionCreatedEvent,
    SessionUpdatedEvent,
    SourceLanguageChangedEvent,
} from "./events.js";
import { AUTOMATIC_SOURCE_LANGUAGE } from "./options.js";
import { RealtimeSession, SESSION_READY_TIMEOUT_MS } from "./RealtimeSession.js";

/**
 * The two directions of one call, linked so each translates into the other's language.
 *
 * `localSpeakerSession` carries the local microphone and `otherPartySession` the other party's
 * audio. Whenever one session's source language becomes known or changes, the pair sets it as the
 * other session's target language, so each side hears the other in its own language.
 *
 * Everything else is done on the sessions themselves: sending audio, handling events, and
 * confirming a `SourceLanguageSwitchConfirmationRequested` with
 * `updateLanguages({ sourceLanguage })`. A confirmed switch is a source language change like any
 * other, so the pair passes it on to the other session too.
 *
 * Open one with `client.realtime.connectSessionPair(...)`.
 */
export class RealtimeSessionPair {
    constructor(
        readonly localSpeakerSession: RealtimeSession,
        readonly otherPartySession: RealtimeSession,
    ) {
        linkSourceLanguageToTargetLanguage(localSpeakerSession, otherPartySession);
        linkSourceLanguageToTargetLanguage(otherPartySession, localSpeakerSession);
    }

    /** Resolves once both sessions are ready; see `RealtimeSession.waitUntilReady`. */
    async waitUntilReady(timeoutMs: number = SESSION_READY_TIMEOUT_MS): Promise<void> {
        await Promise.all([
            this.localSpeakerSession.waitUntilReady(timeoutMs),
            this.otherPartySession.waitUntilReady(timeoutMs),
        ]);
    }

    async close(): Promise<void> {
        await Promise.all([this.localSpeakerSession.close(), this.otherPartySession.close()]);
    }
}

/**
 * Keeps `listeningSession`'s target language equal to `speakingSession`'s source language.
 *
 * The source language is known once the speaking session reports it (or was opened with a fixed
 * one); it is passed on as soon as the listening session is ready to take a change.
 */
function linkSourceLanguageToTargetLanguage(
    speakingSession: RealtimeSession,
    listeningSession: RealtimeSession,
): void {
    let speakingSessionLanguage: string | undefined;
    let listeningSessionTargetLanguage: string | undefined;

    const passOnSpeakingSessionLanguage = async (): Promise<void> => {
        const language = speakingSessionLanguage;
        if (
            language === undefined ||
            !listeningSession.isReady ||
            listeningSession.isClosed ||
            isSameLanguageCode(language, listeningSessionTargetLanguage)
        ) {
            return;
        }
        listeningSessionTargetLanguage = language;
        try {
            await listeningSession.updateLanguages({ targetLanguage: language });
        } catch {
            // The listening session closing mid-send is the usual cause; its own `Closed` event
            // reports that.
        }
    };

    speakingSession.on(ServerEventType.SessionCreated, async (event: SessionCreatedEvent) => {
        if (event.session.sourceLanguage !== AUTOMATIC_SOURCE_LANGUAGE) {
            speakingSessionLanguage = event.session.sourceLanguage;
            await passOnSpeakingSessionLanguage();
        }
    });
    speakingSession.on(
        ServerEventType.SourceLanguageChanged,
        (event: SourceLanguageChangedEvent) => {
            speakingSessionLanguage = event.language;
            return passOnSpeakingSessionLanguage();
        },
    );
    listeningSession.on(ServerEventType.SessionCreated, (event: SessionCreatedEvent) => {
        listeningSessionTargetLanguage = event.session.targetLanguage;
        return passOnSpeakingSessionLanguage();
    });
    listeningSession.on(ServerEventType.SessionUpdated, (event: SessionUpdatedEvent) => {
        listeningSessionTargetLanguage = event.session.targetLanguage;
    });
}

function isSameLanguageCode(firstLanguageCode: string, secondLanguageCode: string | undefined): boolean {
    const comparable = (languageCode: string) => languageCode.replace(/_/g, "-").toLowerCase();
    return (
        secondLanguageCode !== undefined &&
        comparable(firstLanguageCode) === comparable(secondLanguageCode)
    );
}
