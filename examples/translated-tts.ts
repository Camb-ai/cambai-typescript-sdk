import { CambClient, CambApi } from "@camb-ai/sdk";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
  });

  const submitted = await client.translatedTts.createTranslatedTts({
    text: "Good morning, welcome to our service.",
    voice_id: 147320, // more voices: await client.voiceCloning.listVoices()
    source_language: CambApi.Languages.EN_US,
    target_language: CambApi.Languages.FR_FR,
  });
  const taskId = submitted.task_id;

  let runId: number | undefined;
  while (true) {
    const status = await client.translatedTts.getTranslatedTtsTaskStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(3000);
  }

  const info = await client.textToSpeech.getTtsRunInfo({
    run_id: runId!,
    output_type: "FILE_URL",
  });

  console.log(info);

}

void main();
