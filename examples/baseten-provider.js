import { CambApiClient, saveStreamToFile } from '@camb-ai/sdk';
import * as fs from 'fs';

// Initialize client with Baseten provider
const client = new CambApiClient({
    ttsProvider: 'baseten',
    providerParams: {
        api_key: process.env.BASETEN_API_KEY || 'YOUR_BASETEN_API_KEY',
        mars_pro_url: process.env.BASETEN_URL || 'YOUR_BASETEN_MARS_PRO_URL'
    }
});

async function main() {
    try {
        // Read reference audio file (you need to provide this)
        const referenceAudioPath = process.env.REFERENCE_AUDIO_PATH || 'reference.wav';

        if (!fs.existsSync(referenceAudioPath)) {
            console.error(`Reference audio file not found: ${referenceAudioPath}`);
            console.log('Please provide a reference audio file or set REFERENCE_AUDIO_PATH environment variable');
            return;
        }

        const referenceAudio = fs.readFileSync(referenceAudioPath).toString('base64');

        console.log('Generating speech with Baseten provider...');
        const response = await client.textToSpeech.tts({
            text: 'Hello World and my dear friends',
            language: 'en-us',
            speech_model: 'mars-pro',
            additional_body_parameters: {
                reference_audio: referenceAudio,
                reference_language: 'en-us'  // required
            }
        });

        const outputFile = 'baseten_output.wav';
        await saveStreamToFile(response, outputFile);
        console.log(`✓ Audio generated with Baseten provider and saved to ${outputFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', error.body);
        }
    }
}

main();
