import { createReadStream } from "node:fs";
import { CambClient, CambApi } from "@camb-ai/sdk";

const POLL_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
  });

  const submitted = await client.audioSeparation.createAudioSeparation({
    media_file: createReadStream(process.env.AUDIO_SEPARATION_MEDIA_PATH!),
  });
  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.audioSeparation.getAudioSeparationStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(POLL_MS);
  }

  const info = await client.audioSeparation.getAudioSeparationRunInfo({ run_id: runId! });
  console.log(info.foreground_audio_url);
  console.log(info.background_audio_url);
}

void main();
