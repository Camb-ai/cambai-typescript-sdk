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
npm install @camb-ai/sdk@1.0.1
```

Or using yarn:

```bash
yarn add @camb-ai/sdk@1.0.1
```

## 🔑 Authentication & Accessing Clients

To use the Camb AI SDK, you'll need an API key. You can authenticate it by:

```javascript
import { CambClient } from '@camb-ai/sdk';

// Initialize the client
const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });
```

### Client with Specific MARS Pro Provider (e.g. Vertex, Baseten)

#### Baseten

To deploy the model go to models from baseten example: https://www.baseten.co/library/mars6/ and deploy then perform setup like below

```javascript
import { CambClient } from '@camb-ai/sdk';
import * as fs from 'fs';

const client = new CambClient({
  ttsProvider: 'baseten',
  providerParams: {
    apiKey: 'YOUR_BASETEN_API_KEY',
    marsProUrl: 'YOUR_BASETEN_URL'
  }
});

// Call TTS with Baseten
const audioBuffer = fs.readFileSync('audio.wav');
const referenceAudio = Buffer.from(audioBuffer).toString('base64');

const response = await client.textToSpeech.tts({
  text: 'Hello World and my dear friends',
  language: 'en-us',
  speechModel: 'mars-pro',
  additionalBodyParameters: {
    referenceAudio: referenceAudio,
    referenceLanguage: 'en-us'  // required
  },
  timeoutInSeconds: 300
});
```

#### Vertex Support (In Progress)

```javascript
const client = new CambClient({
  ttsProvider: 'vertex',
  providerParams: {
    projectId: 'my-project',
    location: 'us-central1'
  }
});
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
import { CambApiClient, saveStreamToFile } from '@camb-ai/sdk';

// Initialize client (ensure API key is set)
const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

const response = await client.textToSpeech.tts({
  text: 'Hello from Camb AI! This is a test of our Text-to-Speech API.',
  voiceId: 20303,  // Example voice ID, get from client.voiceCloning.listVoices()
  language: 'en-us',
  speechModel: 'mars-pro',  // options: mars-pro, mars-flash, mars-instruct, auto
  outputConfiguration: {
    format: 'mp3'
  }
});

await saveStreamToFile(response, 'tts_output.mp3');
console.log('Success! Audio saved to tts_output.mp3');
```

#### b) Using Mars Flash (Low Latency)

For applications requiring faster responses, switch to `mars-flash` (22.05kHz).

```javascript
const response = await client.textToSpeech.tts({
  text: 'Hey! I can respond much faster.',
  language: 'en-us',
  speechModel: 'mars-flash',
  voiceId: 20303,
  outputConfiguration: {
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
  console.log(`  - ID: ${voice.id}, Name: ${voice.voiceName}, Gender: ${voice.gender}, Language: ${voice.language}`);
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
    voiceDescription: 'A smooth, rich baritone voice layered with a soft echo, ideal for immersive storytelling and emotional depth.'
  });
  console.log(result);
} catch (error) {
  console.error(`Exception when calling textToVoice: ${error}`);
}
```

### 3. Text-to-Audio (Sound Generation)

Generate sound effects or ambient audio from a descriptive prompt.

```javascript
import { CambApiClient, saveStreamToFile } from '@camb-ai/sdk';

const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

const response = await client.textToAudio.createTextToAudio({
  prompt: 'A gentle breeze rustling through autumn leaves in a quiet forest.',
  duration: 10,
  audioType: 'sound'
});

const taskId = response.taskId;
if (taskId) {
  while (true) {
    const status = await client.textToAudio.getTextToAudioStatus({ taskId });
    console.log(`Status: ${status.status}`);
    
    if (status.status === 'SUCCESS') {
      const result = await client.textToAudio.getTextToAudioResult(status.runId);
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
import { CambClient } from '@camb-ai/sdk';

const client = new CambClient({ apiKey: 'YOUR_CAMB_API_KEY' });

const response = await client.dub.createDub({
  videoUrl: 'your_accessible_video_url',
  sourceLanguage: 'en-us',  // Check client.languages.getSourceLanguages()
  targetLanguage: 'hi-in'   // Example target language
});

const taskId = response.taskId;
console.log(`Dub Task created with ID: ${taskId}`);

while (true) {
  const statusResponse = await client.dub.getDubbingStatus({ taskId });
  console.log(`Current Status: ${statusResponse.status}`);
  
  if (statusResponse.status === 'SUCCESS') {
    const dubbedRunInfo = await client.dub.getDubbedRunInfo(statusResponse.runId);
    console.log(`Dubbed Audio URL: ${dubbedRunInfo.audioUrl}`);
    console.log(`Transcript: ${dubbedRunInfo.transcript}`);
    console.log(`Dubbed Video URL: ${dubbedRunInfo.videoUrl}`);
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
import { CambApiClient, CambApi } from '@camb-ai/sdk';

const client = new CambApiClient({ apiKey: 'YOUR_CAMB_API_KEY' });

// Full type safety
const response: AsyncIterable<Uint8Array> = await client.textToSpeech.tts({
  text: 'Hello world',
  language: 'en-us',
  speechModel: 'mars-pro',
  voiceId: 20303
});
```

## 📖 Examples

Check out the `examples/` directory for complete, runnable examples:

- `basic-tts.js` - Basic text-to-speech example
- `async-tts.js` - Async TTS with streaming
- `text-to-audio.js` - Sound generation example
- `dubbing.js` - Video dubbing workflow
- `baseten-provider.js` - Using custom providers

## 🔗 Links

- [Documentation](https://docs.camb.ai)
- [GitHub Repository](https://github.com/Camb-ai/cambai-node-sdk)
- [Python SDK](https://github.com/Camb-ai/cambai-python-sdk)
- [Discord Community](https://discord.gg/hzXnxTxhFw)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
