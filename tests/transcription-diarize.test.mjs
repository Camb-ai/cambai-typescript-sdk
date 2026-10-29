import assert from "node:assert/strict";
import test from "node:test";
import { CambClient } from "../dist/index.js";

for (const diarize of [undefined, true, false]) {
  test(`transcription sends diarize=${diarize}`, async () => {
    const requests = [];
    const client = new CambClient({apiKey: "test", fetch: async (url, init) => {
      requests.push(init.body);
      return new Response(JSON.stringify({task_id: "task"}), {status: 200, headers: {"content-type": "application/json"}});
    }});
    await client.transcription.createTranscription({language: 1, media_url: "https://example.com/clip.wav", diarize});
    assert.equal(requests[0].get("diarize"), String(diarize ?? true));
  });
}
