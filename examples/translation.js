import { CambClient, CambApi } from '@camb-ai/sdk';

const SOURCE_LANGUAGE = CambApi.Languages.EN_US;
const TARGET_LANGUAGE = CambApi.Languages.FR_FR;
const TEXTS = [
    'Hello, how are you today?',
    'This translation was created with the Camb TypeScript SDK.',
];
const POLL_INTERVAL_SECONDS = 2;

const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY
});

function sleep(seconds) {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

async function main() {
    console.log(`>> source enum: ${SOURCE_LANGUAGE}`);
    console.log(`>> target enum: ${TARGET_LANGUAGE}`);

    const createResponse = await client.translation.createTranslation({
        texts: TEXTS,
        source_language: SOURCE_LANGUAGE,
        target_language: TARGET_LANGUAGE,
    });
    const taskId = createResponse.task_id;

    console.log(`>> translation task created: ${taskId}`);

    let runId;
    while (true) {
        const statusResponse = await client.translation.getTranslationTaskStatus({
            task_id: taskId
        });
        const status = statusResponse.status;
        runId = statusResponse.run_id;
        console.log(`>> task status: ${status}`);
        if (status === 'SUCCESS') {
            break;
        }
        await sleep(POLL_INTERVAL_SECONDS);
    }

    const result = await client.translation.getTranslationResult({
        run_id: runId
    });
    console.log('>> translated texts:');
    result.texts.forEach((text, index) => {
        console.log(`${index + 1}. ${text}`);
    });
}

main().catch((error) => {
    console.error('Error:', error.message);
    if (error.body) {
        console.error('Details:', error.body);
    }
});
