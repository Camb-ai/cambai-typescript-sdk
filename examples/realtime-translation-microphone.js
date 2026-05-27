// Realtime speech-to-speech translation from the microphone.
//
// Speak into your mic in the source language; the translated speech is played
// back through your speakers in near real time, and the translated text is
// printed as it arrives. Audio is PCM16 mono at 24 kHz in both directions.
//
// Requires:
//   npm install @camb-ai/sdk node-record-lpcm16
//   sox on the host — checked at startup (mic capture + speaker playback)
//
// Run with:
//   export CAMB_API_KEY=...
//   node examples/realtime-translation-microphone.js [en-us] [de-de]

import {
    CambClient,
    Microphone,
    RealtimeServerEventType,
    SoxRequiredError,
    assertSoxAvailable,
    createSoxPcmSpeakerChecked,
} from "@camb-ai/sdk";

const SAMPLE_RATE = 24000; // PCM16 mono, both directions

const apiKey = process.env.CAMB_API_KEY;
if (!apiKey) {
    console.error("Missing CAMB_API_KEY environment variable.");
    process.exit(1);
}

async function main() {
    try {
        await assertSoxAvailable({ playback: true });
    } catch (err) {
        if (err instanceof SoxRequiredError) {
            console.error(err.message);
            process.exit(1);
        }
        throw err;
    }

    const sourceLanguage = process.argv[2] ?? "en-us";
    const targetLanguage = process.argv[3] ?? "de-de";

    const client = new CambClient({ apiKey });
    const session = await client.realtime.connect({
        sourceLanguage,
        targetLanguage,
    });

    const speaker = await createSoxPcmSpeakerChecked({ sampleRate: SAMPLE_RATE });

    session.on(RealtimeServerEventType.SessionStarting, () =>
        console.log("Booting the translation pipeline (this can take 30s+)..."),
    );
    session.on(RealtimeServerEventType.SessionCreated, () =>
        console.log(`Ready. Speak in ${sourceLanguage}; you'll hear ${targetLanguage}. Ctrl-C to stop.`),
    );
    session.on(RealtimeServerEventType.TranscriptCompleted, (event) =>
        console.log(`\n[you]         ${event.transcript}`),
    );
    session.on(RealtimeServerEventType.TextDone, (event) =>
        console.log(`[translation] ${event.text}`),
    );
    session.on(RealtimeServerEventType.AudioDelta, (event) => speaker.feed(Buffer.from(event.data)));
    session.on(RealtimeServerEventType.Error, (err) =>
        console.error(`\nServer error: ${err.message}`),
    );
    session.on(RealtimeServerEventType.Closed, (info) =>
        console.log(`\nClosed: code=${info.code} reason=${info.reason}`),
    );

    await session.waitUntilReady();

    const mic = Microphone.fromNode({ sampleRate: SAMPLE_RATE });
    await mic.start();

    process.on("SIGINT", async () => {
        await mic.stop();
        await speaker.close();
        await session.close();
        process.exit(0);
    });

    await session.stream(mic);
    await speaker.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
