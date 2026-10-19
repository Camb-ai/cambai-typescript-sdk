import { CambClient, CambApi } from '@camb-ai/sdk';

const POLL_INTERVAL_MS = 5000;
const PENDING_STATUS = 'PENDING';

const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY
});

async function waitFor(poll, taskId) {
    while (true) {
        const result = await poll({ task_id: taskId });
        if (result.status !== PENDING_STATUS) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
}

async function editAnExistingRun() {
    const runId = Number(process.env.CAMB_RUN_ID);

    if (!process.env.CAMB_API_KEY) {
        console.error('Set CAMB_API_KEY to run this example.');
        return;
    }
    if (!runId) {
        console.error('Set CAMB_RUN_ID to a finished dub run to edit.');
        return;
    }

    // Re-transcribe one window instead of redoing the whole run. Omit the window
    // to redo all of it, and omit source_language to use the run's own.
    let task = await client.spotTranscription.createSpotTranscription({
        run_id: runId,
        start_seconds: 30,
        end_seconds: 45
    });
    let result = await waitFor(
        (request) => client.spotTranscription.getSpotTranscriptionStatus(request),
        task.task_id
    );
    console.log(`spot transcription: ${result.status}`);

    // Re-translate named lines only. target_language picks which of the run's
    // translations to redo, so the run must already have a transcript in it.
    // fix_duration keeps the original timing, which matters once the audio is
    // cut to picture; rephrase lets it move.
    task = await client.spotTranslation.createSpotTranslation({
        run_id: runId,
        dialogue_ids: ['8842'],
        source_language: CambApi.Languages.EN_US,
        target_language: CambApi.Languages.ES_ES,
        generation_type: CambApi.GenerationType.FixDuration
    });
    result = await waitFor(
        (request) => client.spotTranslation.getSpotTranslationStatus(request),
        task.task_id
    );
    console.log(`spot translation: ${result.status}`);

    // Narrate what happens on screen. Name a speaker_id or voice_id, or omit
    // both and let the pipeline choose.
    task = await client.sceneAudioDescription.createSceneAudioDescription({ run_id: runId });
    result = await waitFor(
        (request) => client.sceneAudioDescription.getSceneAudioDescriptionStatus(request),
        task.task_id
    );
    console.log(`audio description: ${result.status}`);

    // Pull one layer out of the finished mix: dialogue, background or foreground.
    task = await client.exportStems.createExportStems({
        run_id: runId,
        audio_to_export: CambApi.AudioToExport.Background,
        type: CambApi.AudioOutputType.Wav
    });
    result = await waitFor(
        (request) => client.exportStems.getExportStemsStatus(request),
        task.task_id
    );
    console.log(`stem export: ${result.status}`);
}

editAnExistingRun().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
