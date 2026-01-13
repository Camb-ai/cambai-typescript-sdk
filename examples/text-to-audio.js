import { CambApiClient, saveStreamToFile } from '@camb-ai/sdk';

const client = new CambApiClient({
    apiKey: process.env.CAMB_API_KEY
});

async function testTextToAudio() {
    try {
        // Note: audio_type values are "sound" or "music"
        console.log('Creating text-to-audio task...');
        const response = await client.textToAudio.createTextToAudio({
            prompt: 'A futuristic sci-fi laser sound effect',
            duration: 3.0,
            audio_type: 'sound'
        });

        console.log('Response:', JSON.stringify(response, null, 2));
        const taskId = response.task_id || response.taskId;
        console.log(`Task created with ID: ${taskId}`);

        if (!taskId) {
            console.error('Failed to get task ID.');
            return;
        }

        // Poll for status
        console.log('Polling for status...');
        let attempts = 0;
        const maxAttempts = 30; // 60 seconds max

        while (attempts < maxAttempts) {
            const statusResponse = await client.textToAudio.getTextToAudioStatus({
                task_id: taskId
            });

            console.log(`Current Status: ${statusResponse.status}`);

            if (statusResponse.status === 'SUCCESS') {
                console.log('Task completed! Downloading result...');
                const runId = statusResponse.run_id || statusResponse.runId;
                const result = await client.textToAudio.getTextToAudioResult({
                    run_id: runId
                });

                const outputFile = 'text_to_audio_output.mp3';
                await saveStreamToFile(result, outputFile);
                console.log(`✓ Audio saved to ${outputFile}`);
                break;
            } else if (statusResponse.status === 'FAILED') {
                console.error('Task failed!');
                break;
            }

            // Wait 2 seconds before polling again
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            console.error('Timeout waiting for task completion');
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', JSON.stringify(error.body, null, 2));
        }
    }
}

testTextToAudio();
