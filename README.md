# CAMB.AI TypeScript SDK

<div id="top" align="center">

![Banner](assets/banner5_720.jpg)

[![npm version](https://img.shields.io/npm/v/@camb-ai/sdk.svg?style=flat-square)](https://www.npmjs.com/package/@camb-ai/sdk) [![License](https://img.shields.io/npm/l/@camb-ai/sdk.svg?style=flat-square)](https://github.com/Camb-ai/cambai-node-sdk/blob/main/LICENSE)

</div>

The official TypeScript and Node.js client for [Camb.ai](https://camb.ai/). It wraps our REST APIs with typed models, ES module exports, and helpers for streaming audio to disk. Requires **Node.js 18+**.

See the [TypeScript SDK guide](https://docs.camb.ai/sdk-guides/typescript-sdk) for full patterns. Explore the examples in [`examples/`](examples/).

## Features

- **Streaming text-to-speech** — Stream speech from text with library or cloned voices; save to WAV, MP3, and other formats.
- **Translated TTS** — Translate copy and synthesize it in the target language in one job.
- **Text-to-audio** — Generate sound effects or music-style audio from a text prompt.
- **Text-to-voice** — Describe a voice in words and preview generated samples.
- **Dubbing** — Localize video with translated speech matched to the original speaker.
- **Translation** — Batch-translate strings across supported language pairs.
- **Transcription** — Transcribe audio or video from a URL or upload.
- **Audio separation** — Split a mix into stems such as vocals and background.
- **Stories & folders** — Build long-form narration from documents and organize projects.
- **Custom providers** — Point TTS at your own MARS deployment (for example on Baseten) via `providerParams`.

## Installation

```bash
npm install @camb-ai/sdk
```

```bash
yarn add @camb-ai/sdk
```

```bash
pnpm add @camb-ai/sdk
```

## Authentication

Create an API key in [Camb.ai Studio](https://studio.camb.ai), then pass it from the environment (shell export, your host, or `node --env-file`):

```typescript
import { CambClient } from "@camb-ai/sdk";

const client = new CambClient({
  apiKey: process.env.CAMB_API_KEY,
});
```

Every client method returns a `Promise`. Use `async`/`await` at the call site.

## Usage

### Streaming TTS

```typescript
import { CambClient, CambApi, saveStreamToFile } from "@camb-ai/sdk";

const client = new CambClient({
  apiKey: process.env.CAMB_API_KEY,
});

async function main() {
  const stream = await client.textToSpeech.tts({
    text: "Hello from the Camb TypeScript SDK.",
    language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
    voice_id: 147320, // browse voices: await client.voiceCloning.listVoices()
    speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsFlash,
    output_configuration: { format: "wav" },
  });
  await saveStreamToFile(stream, "output.wav");
}

void main();
```

### Translation

```typescript
import { CambClient, CambApi } from "@camb-ai/sdk";

const client = new CambClient({ apiKey: process.env.CAMB_API_KEY });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const submitted = await client.translation.createTranslation({
    texts: ["Hello, how are you today?"],
    source_language: CambApi.Languages.EN_US,
    target_language: CambApi.Languages.FR_FR,
  });

  let runId: number | undefined;
  while (true) {
    const status = await client.translation.getTranslationTaskStatus({
      task_id: submitted.task_id!,
    });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(3000);
  }

  const result = await client.translation.getTranslationResult({ run_id: runId! });
  console.log(result.texts);
}

void main();
```

### Dubbing

```typescript
import { CambClient, CambApi } from "@camb-ai/sdk";

const client = new CambClient({ apiKey: process.env.CAMB_API_KEY });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const submitted = await client.dub.endToEndDubbing({
    video_url: process.env.VIDEO_URL!,
    source_language: CambApi.Languages.EN_US,
    target_language: CambApi.Languages.HI_IN,
  });

  let runId: number | undefined;
  while (true) {
    const status = await client.dub.getEndToEndDubbingStatus({
      task_id: submitted.task_id!,
    });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(5000);
  }

  const info = await client.dub.getDubbedRunInfo({ run_id: runId! });
  console.log(info.video_url ?? info.audio_url);
}

void main();
```

## API overview

| Feature | Documentation | Example |
| --- | --- | --- |
| Streaming TTS | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#quick-start) | [`examples/basic-tts.ts`](examples/basic-tts.ts) |
| Translated TTS | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#translated-tts) | [`examples/translated-tts.ts`](examples/translated-tts.ts) |
| Text-to-audio | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#text-to-audio) | [`examples/text-to-audio.ts`](examples/text-to-audio.ts) |
| Text-to-voice | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#text-to-voice) | [`examples/text-to-voice.ts`](examples/text-to-voice.ts) |
| Dubbing | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#dubbing) | [`examples/dubbing.ts`](examples/dubbing.ts) |
| Translation | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#translation) | [`examples/translation.ts`](examples/translation.ts) |
| Transcription | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#transcription) | [`examples/transcription.ts`](examples/transcription.ts) |
| Audio separation | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#audio-separation) | [`examples/audio-separation.ts`](examples/audio-separation.ts) |
| Stories | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#stories) | [`examples/story.ts`](examples/story.ts) |
| Custom provider (Baseten) | [Guide](https://docs.camb.ai/sdk-guides/typescript-sdk#custom-provider) | [`examples/baseten-provider.ts`](examples/baseten-provider.ts) |

Self-hosted MARS deployments are covered in [Custom Cloud Providers](https://docs.camb.ai/custom-cloud-providers).


## Links

- [TypeScript SDK guide](https://docs.camb.ai/sdk-guides/typescript-sdk)
- [API reference](https://docs.camb.ai/api-reference)
- [npm — @camb-ai/sdk](https://www.npmjs.com/package/@camb-ai/sdk)
- [Python SDK](https://github.com/Camb-ai/cambai-python-sdk)

## License

MIT. See [LICENSE](LICENSE).
