import { CambClient, CambApi } from "@camb-ai/sdk";

const POLL_MS = 3000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const SPEECH_TEXT = `
Good evening. Tonight, the city sleeps under a thin veil of rain,
and every streetlight looks like a small sun trapped in glass.
If you listen closely, you can hear the rhythm of footsteps fading
into the distance—steady, unhurried, almost like a heartbeat.
Somewhere, a clock strikes the hour, and for a moment, everything feels still.
`.trim();

const VOICE_DESCRIPTION = `
Adult male, late 30s to early 40s, North American accent with a neutral,
broadcast-quality tone. Deep, warm baritone with smooth resonance and clear
diction. Pace is measured and unhurried, with gentle pauses at commas and
a slight lift at the end of reflective sentences. Delivery is calm, intimate,
and slightly wistful—like a late-night radio host reading poetry, not
performing for a crowd. Low breath noise, minimal sibilance, consistent volume,
and a soft, natural smile in the voice without sounding cheerful or salesy.
`.trim();

const client = new CambClient({
  apiKey: process.env.CAMB_API_KEY,
});

async function main(): Promise<void> {
  const submitted = await client.textToVoice.createTextToVoice({
    text: SPEECH_TEXT,
    voice_description: VOICE_DESCRIPTION,
  });
  const taskId = submitted.task_id!;

  let runId: number | undefined;
  while (true) {
    const status = await client.textToVoice.getTextToVoiceStatus({ task_id: taskId });
    if (status.status === CambApi.TaskStatus.Success) {
      runId = status.run_id ?? undefined;
      break;
    }
    await sleep(POLL_MS);
  }

  const result: CambApi.GetTextToVoiceResultOut = await client.textToVoice.getTextToVoiceResult({
    run_id: runId!,
  });

  console.log(result);
}

void main();
