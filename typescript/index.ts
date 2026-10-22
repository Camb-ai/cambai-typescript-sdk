export * as CambApi from "./api/index.js";
export type { BaseClientOptions, BaseRequestOptions } from "./BaseClient.js";
export { CambClient } from "./Client.js";
export { CambApiEnvironment } from "./environments.js";
export { CambApiError, CambApiTimeoutError } from "./errors/index.js";
export * from "./exports.js";
export * as LiveTranscription from "./api/resources/liveTranscription/index.js";
export {
    Encoding as LiveTranscriptionEncoding,
    LiveTranscriptionClient,
    LiveTranscriptionConnectError,
    LiveTranscriptionError,
    LiveTranscriptionProtocolError,
    LiveTranscriptionSession,
    Microphone,
    MicrophoneUnavailableError,
    ServerMessageType,
    bindTranscriptPrinter,
    createTranscriptPrinter,
    type TranscriptPrinter,
} from "./api/resources/liveTranscription/index.js";
export * as Realtime from "./api/resources/realtime/index.js";
export {
    OutputModality as RealtimeOutputModality,
    RealtimeClient,
    RealtimeConnectError,
    RealtimeError,
    RealtimeMode,
    RealtimeProtocolError,
    RealtimeSession,
    RealtimeSessionPair,
    ServerEventType as RealtimeServerEventType,
    SpeakerSetup as RealtimeSpeakerSetup,
} from "./api/resources/realtime/index.js";
export { saveStreamToFile } from "./utils.js";
export {
    SoxRequiredError,
    assertSoxAvailable,
    assertSoxMicAvailable,
    assertSoxPlaybackAvailable,
    createSoxPcmSpeaker,
    createSoxPcmSpeakerChecked,
    getSoxInstallInstructions,
    isSoxAvailable,
    isSoxPlayAvailable,
    type CreateSoxPcmSpeakerOptions,
    type SoxPcmSpeaker,
} from "./sox.js";
