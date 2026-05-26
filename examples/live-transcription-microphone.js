// Stream microphone audio to the CAMB live transcription WebSocket.
//
// Requires:
//   npm install ws node-record-lpcm16
//   sox on the host (e.g. brew install sox on macOS)
//
// Run with:
//   export CAMB_API_KEY=...
//   node examples/live-transcription-microphone.js

import { CambClient, Microphone, ServerMessageType, bindTranscriptPrinter } from "@camb-ai/sdk";

const apiKey = process.env.CAMB_API_KEY;
if (!apiKey) {
    console.error("Missing CAMB_API_KEY environment variable.");
    process.exit(1);
}

async function main() {
    const client = new CambClient({ apiKey });

    const session = await client.liveTranscription.connect({
        model: "boli-v5",
        language: "en-us",
        sampleRate: 16000,
    });

    session.on(ServerMessageType.Ready, () => {
        console.log("Session ready. Speak into the microphone; Ctrl-C to stop.");
    });

    const printer = bindTranscriptPrinter(session);

    session.on(ServerMessageType.Error, (err) => {
        printer.newline();
        console.error(`Server error: ${err.code ?? "?"} ${err.message}`);
    });

    session.on(ServerMessageType.Closed, (info) => {
        printer.newline();
        console.log(`Closed: code=${info.code} reason=${info.reason}`);
    });

    await session.waitUntilReady();

    const mic = Microphone.fromNode({ sampleRate: 16000 });
    await mic.start();

    process.on("SIGINT", async () => {
        await mic.stop();
        await session.close();
        process.exit(0);
    });

    await session.pipe(mic);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
