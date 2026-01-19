/**
 * TTS with Reference Audio Example
 *
 * This example demonstrates how to use reference audio directly
 * for voice cloning during TTS generation without creating a
 * persistent custom voice.
 *
 * This approach is useful for:
 *   - One-off voice cloning requests
 *   - Testing different reference audios quickly
 *   - When you don't need to save the voice for later use
 *
 * Requirements:
 *   - Baseten provider credentials (API key and MARS Pro URL)
 *   - A reference audio file (10-30 seconds of clear speech)
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: npm run tts-with-reference
 */

import 'dotenv/config';
import { CambClient, saveStreamToFile } from '@camb-ai/sdk';
import * as fs from 'fs';

// Initialize client with Baseten provider for reference audio support
const client = new CambClient({
    ttsProvider: 'baseten',
    providerParams: {
        api_key: process.env.BASETEN_API_KEY,
        mars_pro_url: process.env.BASETEN_URL
    }
});

async function main() {
    try {
        const referenceAudioPath = process.env.REFERENCE_AUDIO || 'reference.wav';

        // Validate reference audio file exists
        if (!fs.existsSync(referenceAudioPath)) {
            console.error(`Reference audio file not found: ${referenceAudioPath}`);
            console.log('\nUsage:');
            console.log('  BASETEN_API_KEY=xxx BASETEN_URL=xxx REFERENCE_AUDIO=audio.wav node tts-with-reference-audio.js');
            console.log('\nEnvironment variables:');
            console.log('  BASETEN_API_KEY  - Your Baseten API key');
            console.log('  BASETEN_URL      - Your Baseten MARS Pro deployment URL');
            console.log('  REFERENCE_AUDIO  - Path to reference audio file (default: reference.wav)');
            return;
        }

        // Validate Baseten credentials
        if (!process.env.BASETEN_API_KEY || !process.env.BASETEN_URL) {
            console.error('Missing Baseten credentials.');
            console.log('\nPlease set the following environment variables:');
            console.log('  BASETEN_API_KEY  - Your Baseten API key');
            console.log('  BASETEN_URL      - Your Baseten MARS Pro deployment URL');
            return;
        }

        console.log('=== TTS with Reference Audio ===\n');
        console.log(`Reference audio: ${referenceAudioPath}`);

        // Read and encode reference audio as base64
        const referenceAudio = fs.readFileSync(referenceAudioPath).toString('base64');
        console.log(`Audio size: ${(referenceAudio.length / 1024).toFixed(2)} KB (base64)\n`);

        // Text to synthesize
        const textToSpeak = process.env.TEXT ||
            'Hello! This speech is generated using voice cloning with a reference audio file. ' +
            'The AI captures the unique vocal characteristics from the reference and applies them to this text.';

        console.log('Text to synthesize:');
        console.log(`"${textToSpeak}"\n`);

        // Generate speech with reference audio
        console.log('Generating speech with reference audio...');
        const response = await client.textToSpeech.tts({
            text: textToSpeak,
            language: 'en-us',
            speech_model: 'mars-pro',
            voice_settings: {
                enhance_reference_audio_quality: true,
                maintain_source_accent: true
            },
            inference_options: {
                stability: 0.7,
                speaker_similarity: 0.85,
                temperature: 0.8
            },
            additional_body_parameters: {
                reference_audio: referenceAudio,
                reference_language: 'en-us'
            }
        });

        const outputFile = 'reference_audio_output.wav';
        await saveStreamToFile(response, outputFile);

        console.log(`\nAudio generated successfully!`);
        console.log(`Output saved to: ${outputFile}`);

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', JSON.stringify(error.body, null, 2));
        }
    }
}

main();
