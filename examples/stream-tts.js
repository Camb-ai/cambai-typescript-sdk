import { CambClient, CambApi, saveStreamToFile } from '@camb-ai/sdk';

const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY
});

async function main() {
    try {
        console.log('Generating streaming speech...');
        const response = await client.textToSpeech.tts({
            text: 'Hello from Camb AI! This is a demonstration of our streaming text-to-speech technology.',
            voice_id: 147320, // Example voice ID
            language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
            speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.Mars8Flash,
            output_configuration: {
                format: 'wav'
            }
        });

        // Save the audio stream to a file
        const outputFile = 'streaming_output.wav';
        await saveStreamToFile(response, outputFile);
        console.log(`✓ Success! Audio stream saved to ${outputFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', error.body);
        }
    }
}

main();
