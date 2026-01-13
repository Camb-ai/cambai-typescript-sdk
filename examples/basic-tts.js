import { CambApiClient, saveStreamToFile } from '@camb-ai/sdk';

// Initialize the client with your API key
const client = new CambApiClient({
    apiKey: process.env.CAMB_API_KEY
});

async function main() {
    try {
        // List available voices
        console.log('Fetching available voices...');
        const voices = await client.voiceCloning.listVoices();

        if (!voices || voices.length === 0) {
            console.error('No voices available');
            return;
        }

        const voiceId = voices[0].id;
        console.log(`>>> Using voice ID: ${voiceId} (${voices[0].voiceName})`);
        console.log(`>>> Found ${voices.length} total voices\n`);

        // Generate speech
        console.log('Generating speech with MARS Pro model...');
        const response = await client.textToSpeech.tts({
            text: 'Hello from Camb AI! This is a demonstration of our advanced text-to-speech technology using the MARS Pro model.',
            voice_id: voiceId,
            language: 'en-us',
            speech_model: 'mars-pro',
            output_configuration: {
                format: 'mp3'
            }
        });

        // Save the audio stream to a file
        const outputFile = 'tts_output.mp3';
        await saveStreamToFile(response, outputFile);
        console.log(`✓ Success! Audio saved to ${outputFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', error.body);
        }
    }
}

main();
