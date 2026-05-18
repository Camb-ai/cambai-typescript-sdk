import { CambClient, CambApi } from "@camb-ai/sdk";

const client = new CambClient({
  apiKey: process.env.CAMB_API_KEY,
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function testDubbing(): Promise<void> {
  console.log("Creating dubbing task...");
  const response = await client.dub.endToEndDubbing({
    video_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", // Replace with your video URL
    source_language: CambApi.Languages.EN_US,
    target_language: CambApi.Languages.HI_IN,
  });

  const taskId = response.task_id;
  console.log(`Dubbing task created with ID: ${taskId}`);

  while (true) {
    const statusResponse = await client.dub.getEndToEndDubbingStatus({ task_id: taskId! });
    console.log(`Current Status: ${statusResponse.status}`);

    if (statusResponse.status === CambApi.TaskStatus.Success) {
      const info = await client.dub.getDubbedRunInfo({ run_id: statusResponse.run_id! });
      console.log(info);
      console.log(info.video_url);
      console.log(info.audio_url);
      break;
    }

    await sleep(5000);
  }
}

void testDubbing();
