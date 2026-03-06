# Camb.ai TypeScript SDK

[![npm version](https://img.shields.io/npm/v/@camb-ai/sdk.svg?style=flat-square)](https://www.npmjs.com/package/@camb-ai/sdk)
[![License](https://img.shields.io/npm/l/@camb-ai/sdk.svg?style=flat-square)](https://github.com/Camb-ai/cambai-node-sdk/blob/main/LICENSE)

The official TypeScript SDK for interacting with Camb AI's powerful voice and audio generation APIs. Create expressive speech, unique voices, and rich soundscapes with just a few lines of code. Works seamlessly in Node.js environments (18+).

## ✨ Features

- **Dubbing**: Dub your videos into multiple languages with voice cloning!
- **Expressive Text-to-Speech**: Convert text into natural-sounding speech using a wide range of pre-existing voices.
- **Generative Voices**: Create entirely new, unique voices from text prompts and descriptions.
- **Soundscapes from Text**: Generate ambient audio and sound effects from textual descriptions.
- Access to voice cloning, translation, and more (refer to full API documentation).

## 📦 Installation

Install the SDK using npm (requires Node.js 18+):

```bash
npm install @camb-ai/sdk
```

## 🔑 Authentication & Accessing Clients

To use the Camb AI SDK, you'll need an API key. You can authenticate it by:

```javascript
import { CambClient } from '@camb-ai/sdk';

// Initialize the client
const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });
```

### Client with Custom Hosting Provider (e.g. Baseten, Vertex)

#### Baseten

To deploy the model go to models from baseten example: <https://www.baseten.co/library/mars6/> and deploy then perform setup like below

```javascript
import { CambClient, CambApi, saveStreamToFile } from '@camb-ai/sdk';
import * as fs from 'fs';

// Initialize client with Baseten provider
const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY, 
    ttsProvider: 'baseten',
    providerParams: {
        api_key: process.env.BASETEN_API_KEY,
        mars_pro_url: process.env.BASETEN_URL
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
            language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
            speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsPro,
            voice_id: 1, // Required but ignored when using custom hosting provider
            additional_body_parameters: {
                reference_audio: referenceAudio,
                reference_language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs  // required
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
```

## 🚀 Getting Started: Examples

**NOTE**: For more examples and full ready to run files refer to the `examples/` directory.

### 1. Text-to-Speech (TTS)

Convert text into spoken audio using one of Camb AI's high-quality voices.

### Supported Models & Sample Rates

| Model Name | Sample Rate | Description |
| :--- | :--- | :--- |
| **mars-pro** | **48kHz** | High-fidelity, professional-grade speech synthesis. Ideal for long-form content and dubbing. |
| **mars-instruct** | **22.05kHz** | Optimized for instruction-following and nuance control. |
| **mars-flash** | **22.05kHz** | Low-latency model optimized for real-time applications and conversational AI. |

#### a) Get Audio and Save to File

```javascript
import { CambClient, CambApi, saveStreamToFile } from '@camb-ai/sdk';

// Initialize client (ensure API key is set)
const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

const response = await client.textToSpeech.tts({
  text: 'Hello from Camb AI! This is a test of our Text-to-Speech API.',
  voice_id: 20303,  // Example voice ID, get from client.voiceCloning.listVoices()
  language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
  speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsPro,  // options: mars-pro, mars-flash, mars-instruct
  output_configuration: {
    format: 'wav'
  }
});

await saveStreamToFile(response, 'tts_output.wav');
console.log('Success! Audio saved to tts_output.wav');
```

#### b) Using Mars Flash (Low Latency)

For applications requiring faster responses, switch to `mars-flash` (22.05kHz).

```javascript
const response = await client.textToSpeech.tts({
  text: 'Hey! I can respond much faster.',
  language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
  speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsFlash,
  voice_id: 20303,
  output_configuration: {
    format: 'wav'
  }
});

await saveStreamToFile(response, 'fast_output.wav');
```

#### c) List Available Voices

You can list available voices to find a voice_id that suits your needs:

```javascript
const voices = await client.voiceCloning.listVoices();
console.log(`Found ${voices.length} voices:`);

for (const voice of voices.slice(0, 5)) {  // Print first 5 as an example
  console.log(`  - ID: ${voice.id}, Name: ${voice.voice_name}, Gender: ${voice.gender}, Language: ${voice.language}`);
}
```

### 2. Text-to-Voice (Generative Voice)

Create completely new and unique voices from a textual description of the desired voice characteristics.

```javascript
import { CambClient } from '@camb-ai/sdk';

const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

try {
  console.log('Generating a new voice and speech...');
  // Returns 3 sample URLs
  const result = await client.textToVoice.createTextToVoice({
    text: 'Crafting a truly unique and captivating voice that carries a subtle air of mystery, depth, and gentle warmth.',
    voice_description: 'A smooth, rich baritone voice layered with a soft echo, ideal for immersive storytelling and emotional depth.'
  });
  console.log(result);
} catch (error) {
  console.error(`Exception when calling textToVoice: ${error}`);
}
```

### 3. Text-to-Audio (Sound Generation)

Generate sound effects or ambient audio from a descriptive prompt.

```javascript
import { CambClient, saveStreamToFile } from '@camb-ai/sdk';

const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

const response = await client.textToAudio.createTextToAudio({
  prompt: 'A gentle breeze rustling through autumn leaves in a quiet forest.',
  duration: 10,
  audio_type: 'sound'
});

const taskId = response.task_id;
if (taskId) {
  while (true) {
    const status = await client.textToAudio.getTextToAudioStatus({ task_id: taskId });
    console.log(`Status: ${status.status}`);
    
    if (status.status === 'SUCCESS') {
      const result = await client.textToAudio.getTextToAudioResult({ run_id: status.run_id });
      await saveStreamToFile(result, 'sound_effect.mp3');
      console.log('Success! Sound effect saved to sound_effect.mp3');
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

### 4. End-to-End Dubbing

Dub videos into different languages with voice cloning and translation capabilities.

```javascript
import { CambClient, CambApi } from '@camb-ai/sdk';

const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

const response = await client.dub.endToEndDubbing({
  video_url: 'your_accessible_video_url',
  source_language: CambApi.Languages.EN_US,  // Check client.languages.getSourceLanguages()
  target_language: CambApi.Languages.HI_IN   // Example target language
});

const taskId = response.task_id;
console.log(`Dub Task created with ID: ${taskId}`);

while (true) {
  const statusResponse = await client.dub.getDubbingStatus({ task_id: taskId });
  console.log(`Current Status: ${statusResponse.status}`);
  
  if (statusResponse.status === 'SUCCESS') {
    const dubbedRunInfo = await client.dub.getDubbedRunInfo({ run_id: statusResponse.run_id });
    console.log(`Dubbed Audio URL: ${dubbedRunInfo.audio_url}`);
    console.log(`Transcript: ${dubbedRunInfo.transcript}`);
    console.log(`Dubbed Video URL: ${dubbedRunInfo.video_url}`);
    break;
  }
  
  await new Promise(resolve => setTimeout(resolve, 5000));
}
```

## ⚙️ Advanced Usage & Other Features

The Camb AI SDK offers a wide range of capabilities beyond these examples, including:

- Voice Cloning
- Translated TTS
- Audio Dubbing
- Transcription
- And more!

Please refer to the [Official Camb AI API Documentation](https://docs.camb.ai) for a comprehensive list of features and advanced usage patterns.

## 📚 TypeScript Support

This SDK is written in TypeScript and includes full type definitions. You can use it in TypeScript projects with full IntelliSense support:

```typescript
import { CambClient, CambApi } from '@camb-ai/sdk';

const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

// Full type safety
const response: AsyncIterable<Uint8Array> = await client.textToSpeech.tts({
  text: 'Hello world',
  language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
  speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsPro,
  voice_id: 20303
});
```

## 📖 Examples

Check out the `examples/` directory for complete, runnable examples:

- `basic-tts.js` - Basic text-to-speech example
- `text-to-audio.js` - Sound generation example
- `dubbing.js` - Video dubbing workflow
- `baseten-provider.js` - Using custom hosting providers

## 🔗 Links

- [Documentation](https://docs.camb.ai)
- [GitHub Repository](https://github.com/Camb-ai/cambai-typescript-sdk)
- [Python SDK](https://github.com/Camb-ai/cambai-python-sdk)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
