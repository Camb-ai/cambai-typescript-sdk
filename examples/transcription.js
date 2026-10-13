import { CambClient } from "@camb-ai/sdk";

const client = new CambClient({ apiKey: process.env.CAMB_API_KEY });

// Edit these values for your request.
const job = await client.transcription.createTranscription({
    media_url: "https://example.com/meeting.mp3",
    language: "auto", // Or "en-us".
    // transcription_mode: "slow" can be chosen; the default is "fast".
    run_audio_cleaning: false, // Skip source separation.
    include_music_in_fg: false, // Also excludes singing from transcription output.
});
console.log("Task ID:", job.task_id);

let status;
while (true) {
    status = await client.transcription.getTranscriptionTaskStatus({
        task_id: job.task_id,
    });
    if (status.status === "ERROR") {
        throw new Error(status.exception_reason);
    }
    if (status.status === "SUCCESS") {
        break;
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
}

const result = await client.transcription.getTranscriptionResult({
    run_id: status.run_id,
});
console.log(result);
