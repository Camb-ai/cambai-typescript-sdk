export class RealtimeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RealtimeError";
    }
}

export class RealtimeConnectError extends RealtimeError {
    constructor(message: string) {
        super(message);
        this.name = "RealtimeConnectError";
    }
}

export class RealtimeProtocolError extends RealtimeError {
    constructor(message: string) {
        super(message);
        this.name = "RealtimeProtocolError";
    }
}
