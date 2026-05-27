import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class SoxRequiredError extends Error {
    constructor(message?: string) {
        super(message ?? `SoX is required but was not found on PATH.\n\n${getSoxInstallInstructions()}`);
        this.name = "SoxRequiredError";
    }
}

/** Platform-specific commands to install SoX (mic capture and PCM playback on Node). */
export function getSoxInstallInstructions(): string {
    return [
        "Install SoX:",
        "  macOS:   brew install sox",
        "  Windows: choco install sox.portable",
        "           (or: scoop install sox)",
        "  Linux:   sudo apt install sox        # Debian/Ubuntu",
        "           sudo dnf install sox        # Fedora",
    ].join("\n");
}

async function commandExists(command: string): Promise<boolean> {
    try {
        await execFileAsync(command, ["--version"], { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

/** Returns true when the SoX CLI (`sox`, and `rec` for mic capture) is on PATH. */
export async function isSoxAvailable(): Promise<boolean> {
    if (!(await commandExists("sox"))) {
        return false;
    }
    // node-record-lpcm16 shells out to `rec`, which ships with the SoX package.
    return commandExists("rec");
}

/** Returns true when SoX's `play` helper is on PATH (PCM speaker playback). */
export async function isSoxPlayAvailable(): Promise<boolean> {
    return commandExists("play");
}

/**
 * Ensures SoX mic capture is available (`sox` + `rec`). Throws {@link SoxRequiredError} when missing.
 */
export async function assertSoxMicAvailable(): Promise<void> {
    if (!(await isSoxAvailable())) {
        throw new SoxRequiredError();
    }
}

/** Ensures SoX speaker playback is available (`play`). Throws {@link SoxRequiredError} when missing. */
export async function assertSoxPlaybackAvailable(): Promise<void> {
    if (!(await isSoxPlayAvailable())) {
        throw new SoxRequiredError(
            `SoX playback requires the 'play' command on PATH.\n\n${getSoxInstallInstructions()}`,
        );
    }
}

/**
 * Ensures SoX is installed. Throws {@link SoxRequiredError} when missing.
 *
 * @param options.mic When true (default), requires `sox` and `rec` for microphone capture.
 * @param options.playback When true, also requires the `play` command (speaker output).
 */
export async function assertSoxAvailable(options: { mic?: boolean; playback?: boolean } = {}): Promise<void> {
    const needMic = options.mic ?? true;
    if (needMic) {
        await assertSoxMicAvailable();
    }
    if (options.playback) {
        await assertSoxPlaybackAvailable();
    }
}

export interface SoxPcmSpeaker {
    feed(chunk: Uint8Array | Buffer): void;
    close(): Promise<void>;
}

export interface CreateSoxPcmSpeakerOptions {
    /** PCM sample rate in Hz (e.g. 24000 for realtime translation). */
    sampleRate: number;
    /** Channel count; defaults to 1 (mono). */
    channels?: number;
    /** Bits per sample; defaults to 16. */
    bitsPerSample?: number;
}

/**
 * Pipe raw signed PCM16 bytes to the default speaker via SoX `play`.
 * Requires SoX on PATH — call {@link assertSoxAvailable} first or use
 * {@link createSoxPcmSpeaker}, which checks automatically.
 */
export function createSoxPcmSpeaker(options: CreateSoxPcmSpeakerOptions): SoxPcmSpeaker {
    const channels = options.channels ?? 1;
    const bitsPerSample = options.bitsPerSample ?? 16;
    let proc: ChildProcess;
    try {
        proc = spawn(
            "play",
            [
                "-q",
                "-t",
                "raw",
                "-r",
                String(options.sampleRate),
                "-e",
                "signed",
                "-b",
                String(bitsPerSample),
                "-c",
                String(channels),
                "-",
            ],
            { stdio: ["pipe", "ignore", "ignore"] },
        );
    } catch {
        throw new SoxRequiredError();
    }
    return {
        feed(chunk) {
            if (proc.stdin?.writable) {
                proc.stdin.write(chunk);
            }
        },
        close() {
            return new Promise((resolve) => {
                if (proc.stdin?.writable) {
                    proc.stdin.end();
                }
                proc.on("close", () => resolve());
                proc.on("error", () => resolve());
            });
        },
    };
}

/** {@link assertSoxAvailable} + {@link createSoxPcmSpeaker} for speaker playback. */
export async function createSoxPcmSpeakerChecked(
    options: CreateSoxPcmSpeakerOptions,
): Promise<SoxPcmSpeaker> {
    await assertSoxPlaybackAvailable();
    return createSoxPcmSpeaker(options);
}
