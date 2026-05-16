import { CambClient, CambApi } from "@camb-ai/sdk";

const SOURCE_LANGUAGE = CambApi.Languages.EN_US;
const TARGET_LANGUAGE = CambApi.Languages.FR_FR;
const TEXTS = [
  "Hello, how are you today?",
  "This translation was created with the Camb TypeScript SDK.",
];
const POLL_MS = 2000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
  });

  const submitted = await client.translation.createTranslation({
    texts: TEXTS,
    source_language: SOURCE_LANGUAGE,
    target_language: TARGET_LANGUAGE,
  });
  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.translation.getTranslationTaskStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(POLL_MS);
  }

  const result = await client.translation.getTranslationResult({ run_id: runId! });
  for (const line of result.texts) {
    console.log(line);
  }
}

void main();
