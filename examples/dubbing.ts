import { CambClient, CambApi } from "@camb-ai/sdk";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
  });

  const submitted = await client.dub.endToEndDubbing({
    video_url: process.env.VIDEO_URL!,
    source_language: CambApi.Languages.EN_US,
    target_language: CambApi.Languages.HI_IN,
  });

  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.dub.getEndToEndDubbingStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(5000);
  }

  const info = await client.dub.getDubbedRunInfo({ run_id: runId! });
  if (info.video_url) {
    console.log(info.video_url);
  }
  console.log(info.audio_url);
}

void main();
