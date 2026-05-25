import { CambClient, Microphone, ServerMessageType } from "@camb-ai/sdk";

async function main() {
    const client = new CambClient({ apiKey: process.env.CAMB_API_KEY });

    const session = await client.liveTranscription.connect({
        model: "boli-v5",
        language: "en-us",
        sampleRate: 16000,
    });

    session.on(ServerMessageType.Ready, () => {
        console.log("Session ready. Speak into the microphone; Ctrl-C to stop.");
    });

    session.on(ServerMessageType.Results, (msg) => {
        process.stdout.write(`\r${msg.transcript}`);
    });

    session.on(ServerMessageType.Error, (err) => {
        console.error(`\nServer error: ${err.code ?? "?"} ${err.message}`);
    });

    session.on(ServerMessageType.Closed, (info) => {
        console.log(`\nClosed: code=${info.code} reason=${info.reason}`);
    });

    const mic = Microphone.fromNode({ sampleRate: 16000 });
    await mic.start();

    process.on("SIGINT", async () => {
        await mic.stop();
        await session.close();
    });

    await session.pipe(mic);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
