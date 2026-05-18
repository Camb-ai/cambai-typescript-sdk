import { createReadStream } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CambClient, CambApi } from "@camb-ai/sdk";

const resourcesDir = join(dirname(fileURLToPath(import.meta.url)), "resources");
const storyFile = join(resourcesDir, "sample_story.txt");

const POLL_MS = 5000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const client = new CambClient({
  apiKey: process.env.CAMB_API_KEY,
});

async function main(): Promise<void> {
  const submitted = await client.story.createStory({
    file: createReadStream(storyFile),
    source_language: CambApi.Languages.EN_US,
    title: "My Story",
  });
  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.story.getStoryStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(POLL_MS);
  }

  const info = await client.story.getStoryRunInfo({ run_id: runId! });
  console.log(info["audio_url"]);
}

void main();
