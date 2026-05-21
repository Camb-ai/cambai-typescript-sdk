import { writeFileSync } from "node:fs";
import { CambClient, CambApi } from "@camb-ai/sdk";

const POLL_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
  });

  const submitted = await client.transcription.createTranscription({
    language: CambApi.Languages.EN_US,
    media_url: process.env.TRANSCRIPTION_MEDIA_URL!,
  });
  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.transcription.getTranscriptionTaskStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(POLL_MS);
  }

  const result = await client.transcription.getTranscriptionResult({
    run_id: runId!,
    word_level_timestamps: true,
  });
  writeFileSync("transcription_result.json", JSON.stringify(result, null, 2), "utf-8");
}

void main();
