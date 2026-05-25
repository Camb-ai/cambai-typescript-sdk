export class LiveTranscriptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LiveTranscriptionError";
    }
}

export class LiveTranscriptionConnectError extends LiveTranscriptionError {
    constructor(message: string) {
        super(message);
        this.name = "LiveTranscriptionConnectError";
    }
}

export class LiveTranscriptionProtocolError extends LiveTranscriptionError {
    constructor(message: string) {
        super(message);
        this.name = "LiveTranscriptionProtocolError";
    }
}

export class MicrophoneUnavailableError extends LiveTranscriptionError {
    constructor(message: string) {
        super(message);
        this.name = "MicrophoneUnavailableError";
    }
}
