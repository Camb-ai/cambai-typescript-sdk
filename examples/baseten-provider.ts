import { readFileSync } from "node:fs";
import { CambClient, CambApi, saveStreamToFile } from "@camb-ai/sdk";

type BasetenTtsPayload = CambApi.CreateStreamTtsRequestPayload & {
  additional_body_parameters: Record<string, string>;
};

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
    ttsProvider: "baseten",
    providerParams: {
      api_key: process.env.BASETEN_API_KEY,
      mars_pro_url: process.env.BASETEN_URL,
    },
  });

  const referenceAudioPath = process.env.REFERENCE_AUDIO_PATH ?? "reference.wav";
  const referenceAudio = readFileSync(referenceAudioPath).toString("base64");

  const payload: BasetenTtsPayload = {
    text: "Hello from a Baseten-hosted MARS deployment.",
    language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
    voice_id: 1,
    speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.MarsFlash,
    output_configuration: { format: "wav" },
    additional_body_parameters: {
      reference_audio: referenceAudio,
      reference_language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
    },
  };

  const stream = await client.textToSpeech.tts(payload, {
    timeoutInSeconds: 300,
  });

  const outPath = "baseten_output.wav";
  await saveStreamToFile(stream, outPath);
}

void main();
