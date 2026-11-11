import { createReadStream } from "fs";
import { CambClient, CambApi } from "@camb-ai/sdk";

const apiKey = process.env.CAMB_API_KEY;
const documentPath = process.env.CAMB_DOCUMENT_PATH;
const documentUrl = process.env.CAMB_DOCUMENT_URL;

if (!apiKey) {
    console.error("Missing CAMB_API_KEY environment variable.");
    process.exit(1);
}

if (!documentPath && !documentUrl) {
    console.error("Set CAMB_DOCUMENT_PATH (local DOCX/SRT) or CAMB_DOCUMENT_URL.");
    process.exit(2);
}

const client = new CambClient({ apiKey });

function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main() {
    console.log("Creating document translation task...");
    const createResponse = await client.documentTranslation.createDocTranslation({
        source_language: CambApi.Languages.EN_US,
        target_language: CambApi.Languages.ES_ES,
        ...(documentPath ? { media_file: createReadStream(documentPath) } : { media_url: documentUrl }),
    });

    const taskId = createResponse.task_id;
    console.log(`Document translation task created with ID: ${taskId}`);

    console.log("Polling for document translation status...");
    let attempts = 0;
    let runId;

    while (attempts < 60) {
        const statusResponse = await client.documentTranslation.getDocTranslationTaskStatus({
            task_id: taskId,
        });

        console.log(`Current Status: ${statusResponse.status}`);

        if (statusResponse.status === "SUCCESS") {
            runId = statusResponse.run_id;
            break;
        } else if (statusResponse.status === "ERROR") {
            console.error("Document translation failed!");
            console.error("Details:", JSON.stringify(statusResponse, null, 2));
            return;
        }

        await sleep(5);
        attempts++;
    }

    if (!runId) {
        console.error("Timeout waiting for document translation completion");
        return;
    }

    const result = await client.documentTranslation.getDocTranslationResult({ run_id: runId });
    console.log(`Translated document: ${result.download_url}`);
}

main().catch((error) => {
    console.error("Error:", error.message);
    if (error.body) {
        console.error("Details:", error.body);
    }
    process.exit(1);
});
