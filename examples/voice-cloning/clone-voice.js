/**
 * Voice Cloning Example - Create a Custom Voice
 *
 * This example demonstrates how to create a persistent custom voice
 * from a reference audio file using the Camb AI SDK.
 *
 * The created voice will be available in your account and can be
 * used for subsequent TTS requests.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in your credentials
 *   2. Run: npm run clone-voice
 */

import 'dotenv/config';
import { CambClient, saveStreamToFile } from '@camb-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';

const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY
});

async function main() {
    try {
        const referenceAudioPath = process.env.REFERENCE_AUDIO || 'reference.wav';

        // Validate reference audio file exists
        if (!fs.existsSync(referenceAudioPath)) {
            console.error(`Reference audio file not found: ${referenceAudioPath}`);
            console.log('\nUsage:');
            console.log('  REFERENCE_AUDIO=path/to/audio.wav node clone-voice.js');
            console.log('\nRequirements:');
            console.log('  - Audio file should be 10-30 seconds of clear speech');
            console.log('  - Supported formats: WAV, MP3, FLAC, OGG');
            console.log('  - Clean audio with minimal background noise works best');
            return;
        }

        const voiceName = process.env.VOICE_NAME || `cloned-voice-${Date.now()}`;

        console.log('=== Voice Cloning Example ===\n');
        console.log(`Reference audio: ${referenceAudioPath}`);
        console.log(`Voice name: ${voiceName}\n`);

        // Create custom voice from reference audio
        console.log('Creating custom voice from reference audio...');
        const customVoice = await client.voiceCloning.createCustomVoice({
            file: fs.createReadStream(referenceAudioPath),
            voice_name: voiceName,
            gender: 1, // 1 = male, 2 = female
            description: 'Custom cloned voice from reference audio',
            language: 1, // 1 = English
            enhance_audio: true // Enable audio enhancement for better quality
        });

        console.log('\nCustom voice created successfully!');
        console.log(`Voice ID: ${customVoice.voice_id}`);
        console.log(`Voice Name: ${customVoice.voice_name || voiceName}`);

        // Now use the cloned voice for TTS
        console.log('\nGenerating speech with the cloned voice...');
        const response = await client.textToSpeech.tts({
            text: 'Hello! This is my cloned voice speaking. The voice cloning technology captures the unique characteristics of the original speaker.',
            voice_id: customVoice.voice_id,
            language: 'en-us',
            speech_model: 'mars-flash',
            output_configuration: {
                format: 'wav'
            }
        });

        const outputFile = 'cloned_voice_output.wav';
        await saveStreamToFile(response, outputFile);
        console.log(`Audio saved to: ${outputFile}`);

        // List all voices to confirm creation
        console.log('\n--- Your Custom Voices ---');
        const voices = await client.voiceCloning.listVoices();
        const customVoices = voices.filter(v => v.voiceName?.includes('cloned') || v.id === customVoice.voice_id);
        customVoices.forEach(v => {
            console.log(`  - ${v.voiceName} (ID: ${v.id})`);
        });

        console.log('\nVoice cloning complete!');

    } catch (error) {
        console.error('Error:', error.message);
        if (error.body) {
            console.error('Details:', JSON.stringify(error.body, null, 2));
        }
    }
}

main();
