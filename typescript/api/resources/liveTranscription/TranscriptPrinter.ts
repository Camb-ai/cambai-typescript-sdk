import readline from "node:readline";

import { ServerMessageType } from "./events.js";
import type { LiveTranscriptionSession } from "./LiveTranscriptionSession.js";

export interface TranscriptPrinter {
    printInterim(transcript: string): void;
    printFinal(transcript: string): void;
    newline(): void;
}

function wrappedLineCount(text: string, width: number): number {
    if (!text) return 0;
    let lines = 0;
    for (const segment of text.split("\n")) {
        lines += Math.max(1, Math.ceil(segment.length / width));
    }
    return lines;
}

/** Replace the previous transcript block in-place (handles terminal wrap). */
export function createTranscriptPrinter(): TranscriptPrinter {
    let prevLines = 0;
    let lastText = "";

    function rewriteBlock(text: string): void {
        if (!process.stdout.isTTY) {
            process.stdout.write(`${text}\n`);
            prevLines = 0;
            return;
        }

        const width = process.stdout.columns || 80;
        if (prevLines > 0) {
            readline.moveCursor(process.stdout, 0, -(prevLines - 1));
            readline.cursorTo(process.stdout, 0);
            readline.clearScreenDown(process.stdout);
        }
        process.stdout.write(text);
        prevLines = wrappedLineCount(text, width);
    }

    function printInterim(transcript: string): void {
        const text = transcript.trim();
        if (!text || text === lastText) return;
        lastText = text;
        rewriteBlock(text);
    }

    function printFinal(transcript: string): void {
        const text = transcript.trim();
        if (text) {
            if (text !== lastText) {
                rewriteBlock(text);
            }
            process.stdout.write("\n");
        } else if (prevLines > 0) {
            process.stdout.write("\n");
        }
        prevLines = 0;
        lastText = "";
    }

    function newline(): void {
        if (prevLines > 0) process.stdout.write("\n");
        prevLines = 0;
        lastText = "";
    }

    return { printInterim, printFinal, newline };
}

/** Wire Deepgram-style interim/final CLI output onto a live session. */
export function bindTranscriptPrinter(session: LiveTranscriptionSession): TranscriptPrinter {
    const printer = createTranscriptPrinter();

    session.on(ServerMessageType.Results, (msg) => {
        if (msg.isFinal) printer.printFinal(msg.transcript);
        else printer.printInterim(msg.transcript);
    });

    session.on(ServerMessageType.Final, (msg) => {
        printer.printFinal(msg.transcript);
    });

    return printer;
}
