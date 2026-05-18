import { CambClient, CambApi, saveStreamToFile } from "@camb-ai/sdk";

const POLL_MS = 2000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const client = new CambClient({
  apiKey: process.env.CAMB_API_KEY,
});

async function main(): Promise<void> {
  // audio_type: "sound" or "music"
  const submitted = await client.textToAudio.createTextToAudio({
    prompt: "A futuristic sci-fi laser sound effect",
    duration: 3.0,
    audio_type: "sound",
  });
  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.textToAudio.getTextToAudioStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(POLL_MS);
  }

  const stream = await client.textToAudio.getTextToAudioResult({ run_id: runId! });
  await saveStreamToFile(stream, "text_to_audio_output.mp3");
}

void main();
