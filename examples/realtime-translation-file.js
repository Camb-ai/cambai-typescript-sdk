// Realtime speech-to-speech translation from a WAV file.
//
// Streams a local WAV at real-time pace, prints the transcript and translated
// text, and writes the translated audio to an output WAV. Pass `--play` to
// hear translated audio through your speakers as it arrives (requires SoX).
//
// The input WAV must be 16-bit PCM, mono, 24 kHz (the rate the realtime
// endpoint expects). Output is written at the same format.
//
// Run with:
//   export CAMB_API_KEY=...
//   node examples/realtime-translation-file.js input_24k_mono.wav [out.wav] [en-us] [de-de]
//   node examples/realtime-translation-file.js --play input_24k_mono.wav

import fs from "node:fs";
import path from "node:path";

import {
    CambClient,
    RealtimeModel,
    RealtimeServerEventType,
    SoxRequiredError,
    assertSoxPlaybackAvailable,
    createSoxPcmSpeaker,
} from "@camb-ai/sdk";

const SAMPLE_RATE = 24000; // PCM16 mono

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

function writeWav(outPath, pcm, sampleRate) {
    const header = Buffer.alloc(44);
    const byteRate = sampleRate * 2; // mono, 16-bit
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // PCM fmt chunk size
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(2, 32); // block align
    header.writeUInt16LE(16, 34); // bits per sample
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(outPath, Buffer.concat([header, pcm]));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const args = process.argv.slice(2);
    const playAudio = args.includes("--play");
    const positional = args.filter((arg) => arg !== "--play");

    const inPath = positional[0];
    if (!inPath) {
        console.error(
            "usage: node examples/realtime-translation-file.js [--play] INPUT.wav [OUT.wav] [SRC] [TGT]",
        );
        process.exit(2);
    }
    const outPath = positional[1] ?? "translated_output.wav";
    const sourceLanguage = positional[2] ?? "en-us";
    const targetLanguage = positional[3] ?? "de-de";

    if (playAudio) {
        try {
            await assertSoxPlaybackAvailable();
        } catch (err) {
            if (err instanceof SoxRequiredError) {
                console.error(err.message);
                process.exit(1);
            }
            throw err;
        }
    }

    const { sampleRate, channels, bitsPerSample, pcm } = readWavHeader(fs.readFileSync(inPath));
    if (sampleRate !== SAMPLE_RATE || channels !== 1 || bitsPerSample !== 16) {
        console.warn(
            `Warning: expected 24 kHz mono 16-bit PCM; got ${sampleRate} Hz, ${channels} ch, ${bitsPerSample}-bit. ` +
                `Re-encode with: ffmpeg -i ${inPath} -ar 24000 -ac 1 -sample_fmt s16 input_24k_mono.wav`,
        );
    }

    const client = new CambClient({ apiKey });
    const session = await client.realtime.connect({
        sourceLanguage,
        targetLanguage,
        // iris is the low-latency model (no cold-boot wait).
        model: RealtimeModel.Iris,
    });

    const speaker = playAudio ? createSoxPcmSpeaker({ sampleRate: SAMPLE_RATE }) : null;
    const outChunks = [];
    let resolveDone;
    const audioDone = new Promise((r) => (resolveDone = r));

    session.on(RealtimeServerEventType.SessionStarting, () =>
        console.log("Booting the translation pipeline (this can take 30s+)..."),
    );
    session.on(RealtimeServerEventType.SessionCreated, () =>
        console.log(
            `Ready. Streaming ${path.basename(inPath)} (${sourceLanguage} -> ${targetLanguage})` +
                (playAudio ? " with speaker playback..." : "..."),
        ),
    );
    session.on(RealtimeServerEventType.TranscriptCompleted, (event) =>
        console.log(`[you]         ${event.transcript}`),
    );
    session.on(RealtimeServerEventType.TextDone, (event) =>
        console.log(`[translation] ${event.text}`),
    );
    session.on(RealtimeServerEventType.AudioDelta, (event) => {
        const chunk = Buffer.from(event.data);
        outChunks.push(chunk);
        speaker?.feed(chunk);
    });
    session.on(RealtimeServerEventType.AudioDone, () => resolveDone());
    session.on(RealtimeServerEventType.Error, (err) =>
        console.error(`Server error: ${err.message}`),
    );

    await session.waitUntilReady();

    // Stream the file at real-time pace in 100ms chunks.
    const chunkMs = 100;
    const bytesPerSec = SAMPLE_RATE * 2;
    const chunkSize = Math.floor((bytesPerSec * chunkMs) / 1000);
    const t0 = Date.now();
    let sent = 0;
    for (let i = 0; i < pcm.length; i += chunkSize) {
        await session.sendAudio(pcm.subarray(i, i + chunkSize));
        sent += chunkSize;
        const drift = (sent / bytesPerSec) * 1000 - (Date.now() - t0);
        if (drift > 0) await sleep(drift);
    }

    // Input is exhausted; give the server time to flush the final translated
    // audio before we close.
    await Promise.race([audioDone, sleep(30_000)]);
    await session.close();
    if (speaker) {
        await speaker.close();
    }

    const audio = Buffer.concat(outChunks);
    if (audio.length > 0) {
        writeWav(outPath, audio, SAMPLE_RATE);
        console.log(`Wrote ${(audio.length / (SAMPLE_RATE * 2)).toFixed(1)}s of translated audio to ${outPath}`);
    } else {
        console.error("No audio received.");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
