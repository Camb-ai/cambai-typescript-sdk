// Stream a local WAV file to the CAMB live transcription WebSocket.
//
// Useful when you cannot capture audio (CI, server, headless) but still
// want to exercise the live transcription pipeline end to end. The file
// is paced at real time so the server sees arrival patterns equivalent
// to a live capture.
//
// Run with:
//   export CAMB_API_KEY=...
//   node examples/live-transcription-file.js path/to/audio.wav

import fs from "node:fs";
import path from "node:path";

import { CambClient, LiveTranscriptionEncoding, ServerMessageType, bindTranscriptPrinter } from "@camb-ai/sdk";

const apiKey = process.env.CAMB_API_KEY;
if (!apiKey) {
    console.error("Missing CAMB_API_KEY environment variable.");
    process.exit(1);
}

function readWavHeader(buf) {
    let offset = 12;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let dataStart = -1;
    let dataLen = 0;
    while (offset < buf.length - 8) {
        const id = buf.toString("ascii", offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        if (id === "fmt ") {
            channels = buf.readUInt16LE(offset + 10);
            sampleRate = buf.readUInt32LE(offset + 12);
            bitsPerSample = buf.readUInt16LE(offset + 22);
        } else if (id === "data") {
            dataStart = offset + 8;
            dataLen = size;
            break;
        }
        offset += 8 + size;
    }
    if (dataStart < 0) throw new Error("no data chunk in WAV");
    return { sampleRate, channels, bitsPerSample, pcm: buf.subarray(dataStart, dataStart + dataLen) };
}

async function main() {
    const file = process.argv[2];
    if (!file) {
        console.error("usage: node examples/live-transcription-file.js PATH_TO_WAV");
        process.exit(2);
    }

    const { sampleRate, channels, bitsPerSample, pcm } = readWavHeader(fs.readFileSync(file));
    console.log(`Streaming ${path.basename(file)} (${sampleRate} Hz, ${channels} ch)`);

    const client = new CambClient({ apiKey });
    const session = await client.liveTranscription.connect({
        model: "boli-v5",
        language: "en-us",
        encoding: LiveTranscriptionEncoding.Linear16,
        sampleRate,
        channels,
    });

    session.on(ServerMessageType.Ready, () => console.log("[Ready]"));

    const printer = bindTranscriptPrinter(session);

    session.on(ServerMessageType.Error, (err) => {
        printer.newline();
        console.error(`[error] ${err.code}: ${err.message}`);
    });
    session.on(ServerMessageType.Closed, (info) => {
        printer.newline();
        console.log(`Closed: code=${info.code} reason=${info.reason}`);
    });

    await session.waitUntilReady();

    const chunkMs = 100;
    const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
    const chunkSize = Math.floor((bytesPerSec * chunkMs) / 1000);
    const t0 = Date.now();
    let sent = 0;
    for (let i = 0; i < pcm.length; i += chunkSize) {
        await session.sendAudio(pcm.subarray(i, i + chunkSize));
        sent += chunkSize;
        const drift = (sent / bytesPerSec) * 1000 - (Date.now() - t0);
        if (drift > 0) await new Promise((r) => setTimeout(r, drift));
    }

    await new Promise((r) => setTimeout(r, 1000));
    await session.close();
    await session.waitUntilClosed();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
