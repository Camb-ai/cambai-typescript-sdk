import { CambClient, CambApi } from "@camb-ai/sdk";

const client = new CambClient({ apiKey: process.env.CAMB_API_KEY });

function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main() {
  const created = await client.imageTranslation.createImageTranslation({
    source_language: CambApi.Languages.EN_US,
    target_languages: [CambApi.Languages.ES_ES],
    media_url: "https://example.com/poster.png",
    content_kind: "generic",
    project_name: "Poster ES",
  });

  console.log(
    `Image translation task created with ID: ${created.task_id} run_id=${created.run_id}`,
  );

  while (true) {
    const statusResponse = await client.imageTranslation.getImageTranslationStatus({
      task_id: created.task_id,
    });
    console.log(`Current Status: ${statusResponse.status}`);
    if (statusResponse.status === "SUCCESS") {
      break;
    }
    if (statusResponse.status === "ERROR") {
      console.error("Image translation task failed!");
      console.error("Details:", JSON.stringify(statusResponse, null, 2));
      return;
    }
    await sleep(5);
  }

  const result = await client.imageTranslation.getImageTranslationResult({
    run_id: created.run_id,
  });
  console.log(result.download_url);

  const project = await client.imageTranslation.getImageTranslationProject({
    run_id: created.run_id,
  });
  console.log(`Pages: ${project.pages.length}`);
}

main();
