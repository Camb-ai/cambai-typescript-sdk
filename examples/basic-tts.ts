import { CambClient, CambApi, saveStreamToFile } from "@camb-ai/sdk";

async function main(): Promise<void> {
  const client = new CambClient({
    apiKey: process.env.CAMB_API_KEY,
  });

  const stream = await client.textToSpeech.tts({
    text: "[confirmation] Your booking is confirmed for Friday at 3 PM.",
    language: CambApi.CreateStreamTtsRequestPayload.Language.EnUs,
    voice_id: 147320, // get more voices: await client.voiceCloning.listVoices()
    speech_model: CambApi.CreateStreamTtsRequestPayload.SpeechModel.Mars81FlashBeta,
    output_configuration: { format: "mp3" },
  });

  await saveStreamToFile(stream, "tts_output.mp3");
}

void main();
