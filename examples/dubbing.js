import { CambClient, CambApi } from '@camb-ai/sdk';

const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY
});

async function testDubbing() {
    try {
        console.log('Creating dubbing task...');
        // Note: source_language and target_language are numeric IDs
        const response = await client.dub.endToEndDubbing({
            video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',  // Replace with your video URL
            source_language: CambApi.Languages.EN_US,
            target_language: CambApi.Languages.HI_IN
        });

        console.log('Response:', JSON.stringify(response, null, 2));
        const taskId = response.task_id;
        console.log(`Dubbing task created with ID: ${taskId}`);

        if (!taskId) {
            console.error('Failed to get task ID.');
            return;
        }

        // Poll for status
        console.log('Polling for dubbing status...');
        let attempts = 0;
        const maxAttempts = 60; // 2 minutes max (dubbing takes longer)

        while (attempts < maxAttempts) {
            const statusResponse = await client.dub.getEndToEndDubbingStatus({
                task_id: taskId
            });

            console.log(`Current Status: ${statusResponse.status}`);

            if (statusResponse.status === 'SUCCESS') {
                console.log('Dubbing completed!');
                const runId = statusResponse.run_id;
                console.log(`Run ID: ${runId}`);

                // Get dubbed video info
                const result = await client.dub.getDubbedRunInfo({
                    run_id: runId
                });

                console.log('Dubbed video info:', JSON.stringify(result, null, 2));
                console.log(`✓ Dubbing successful! Run ID: ${runId}`);
                break;
            } else if (statusResponse.status === 'ERROR') {
                console.error('Dubbing task failed!');
                break;
            }

            // Wait 5 seconds before polling again (dubbing takes longer)
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }

        if (attempts >= maxAttempts) {
            console.error('Timeout waiting for dubbing completion');
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', JSON.stringify(error.body, null, 2));
        }
    }
}

testDubbing();
