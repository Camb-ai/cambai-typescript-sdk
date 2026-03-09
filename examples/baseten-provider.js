import { CambClient, CambApi, saveStreamToFile } from '@camb-ai/sdk';
import * as fs from 'fs';

// Check for required environment variables
const cambApiKey = process.env.CAMB_API_KEY;
const basetenApiKey = process.env.BASETEN_API_KEY;
const basetenUrl = process.env.BASETEN_URL;

if (!cambApiKey || !basetenApiKey || !basetenUrl) {
    console.error('Missing required environment variables:');
    if (!cambApiKey) console.error('- CAMB_API_KEY');
    if (!basetenApiKey) console.error('- BASETEN_API_KEY');
    if (!basetenUrl) console.error('- BASETEN_URL (e.g. your Baseten model endpoint URL)');
    process.exit(1);
}

// Initialize client with Baseten provider
const client = new CambClient({
    apiKey: cambApiKey,
    ttsProvider: 'baseten',
    providerParams: {
        api_key: basetenApiKey,
        mars_pro_url: basetenUrl
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
        const requestPayload = {
            text: 'Hello World and my dear friends',
            language: CambApi.TtsLanguage.EnUs,
            speech_model: CambApi.SpeechModel.MarsPro,
            voice_id: 1, // Required but ignored when using custom hosting provider
            additional_body_parameters: {
                reference_audio: referenceAudio,
                reference_language: CambApi.TtsLanguage.EnUs  // required
            }
        };

        const response = await client.textToSpeech.tts(requestPayload);

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
