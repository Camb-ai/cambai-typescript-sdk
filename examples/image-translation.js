import { CambClient, CambApi } from "@camb-ai/sdk";

const client = new CambClient({ apiKey: process.env.CAMB_API_KEY });

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function waitUntilSuccess(taskId) {
  while (true) {
    const status = await client.imageTranslation.getImageTranslationStatus({
      task_id: taskId,
    });
    console.log(`>> status: ${status.status}`);
    if (status.status === "SUCCESS") {
      return;
    }
    if (status.status === "ERROR") {
      throw new Error(JSON.stringify(status, null, 2));
    }
    await sleep(5);
  }
}

async function main() {
  const created = await client.imageTranslation.createImageTranslation({
    source_language: CambApi.Languages.EN_US,
    target_languages: [CambApi.Languages.ES_ES],
    media_url: "https://example.com/poster.png",
    project_name: "Poster ES",
  });
  console.log(`>> created run_id=${created.run_id}`);
  await waitUntilSuccess(created.task_id);

  const project = await client.imageTranslation.getImageTranslationProject({
    run_id: created.run_id,
  });
  const result = await client.imageTranslation.getImageTranslationResult({
    run_id: created.run_id,
  });
  console.log(`>> translated images: ${result.download_url}`);

  const region = project.pages[0].regions[0];
  const ft = await client.imageTranslation.fineTuneImageTranslation({
    run_id: created.run_id,
    target_language_id: CambApi.Languages.ES_ES,
    region_id: region.region_id,
    prompt: "Use a bolder font and make the text color more vibrant",
  });
  await waitUntilSuccess(ft.task_id);

  const exported = await client.imageTranslation.exportImageTranslation({
    run_id: created.run_id,
    export_format: "PDF",
  });
  if (exported.task_id) {
    await waitUntilSuccess(exported.task_id);
  }

  const updated = await client.imageTranslation.getImageTranslationResult({
    run_id: created.run_id,
  });
  console.log(`>> updated images: ${updated.download_url}`);
}

main();
