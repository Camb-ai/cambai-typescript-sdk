import { CambClient, saveStreamToFile } from '@camb-ai/sdk';

// Initialize the async client
const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY
});

async function main() {
    try {
        // Get available voices
        console.log('Fetching available voices...');
        const voices = await client.voiceCloning.listVoices();

        if (!voices || voices.length === 0) {
            console.error('No voices available');
            return;
        }

        const voiceId = voices[0].id;
        console.log(`>>> Using voice ID: ${voiceId}`);

        // Stream the TTS generation
        console.log('Streaming TTS generation...');
        const response = await client.textToSpeech.tts({
            text: 'Experience high quality text to speech generation using MARS Pro Model.',
            language: 'en-us',
            speech_model: 'mars-pro',
            voice_id: voiceId,
            output_configuration: {
                format: 'wav'
            }
        });

        // Save the stream to a file (or process chunks as they arrive)
        const outputFile = 'async_stream_output.wav';
        await saveStreamToFile(response, outputFile);
        console.log(`✓ Audio stream saved to ${outputFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', error.body);
        }
    }
}

main();
