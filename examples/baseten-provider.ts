import { existsSync, readFileSync } from "node:fs";
import { CambClient, CambApi, saveStreamToFile } from "@camb-ai/sdk";

const cambApiKey = process.env.CAMB_API_KEY;
const basetenApiKey = process.env.BASETEN_API_KEY;
const basetenUrl = process.env.BASETEN_URL;

if (!cambApiKey || !basetenApiKey || !basetenUrl) {
  console.error("Missing required environment variables:");
  if (!cambApiKey) console.error("- CAMB_API_KEY");
  if (!basetenApiKey) console.error("- BASETEN_API_KEY");
  if (!basetenUrl) console.error("- BASETEN_URL (e.g. your Baseten model endpoint URL)");
  process.exit(1);
}

const client = new CambClient({
  apiKey: cambApiKey,
  ttsProvider: "baseten",
  providerParams: {
    api_key: basetenApiKey,
    mars_pro_url: basetenUrl,
  },
});

async function main(): Promise<void> {
  const referenceAudioPath = "reference.wav";

  if (!existsSync(referenceAudioPath)) {
    console.error(`Reference audio file not found: ${referenceAudioPath}`);
    console.log("Please provide a reference audio file named reference.wav");
    return;
  }

  const referenceAudio = readFileSync(referenceAudioPath).toString("base64");

  console.log("Generating speech with Baseten provider...");
  const stream = await client.textToSpeech.tts(
    {
      text: "Hello World and my dear friends",
      language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
      speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsFlash,
      voice_id: 1, // Required but ignored when using a custom hosting provider
      additional_body_parameters: {
        reference_audio: referenceAudio,
        reference_language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs, // required
      },
    },
    { timeoutInSeconds: 300 },
  );

  const outputFile = "baseten_output.wav";
  await saveStreamToFile(stream, outputFile);
  console.log(`Audio generated with Baseten provider and saved to ${outputFile}`);
}

void main();
