import assert from "node:assert/strict";
import test from "node:test";
import { CambClient } from "../dist/index.js";

for (const raw of [false, true]) {
    for (const cleaning of [undefined, true, false]) {
        for (const language of ["auto", "en-us", 1]) {
            test(`transcription raw=${raw} cleaning=${cleaning} language=${language}`, async () => {
                const requests = [];
                const client = new CambClient({apiKey: "test", fetch: async (url, init) => {
                    requests.push({url: String(url), init});
                    return new Response(JSON.stringify({task_id: "test-task"}), {status: 200, headers: {"content-type": "application/json"}});
                }});
                const pending = client.transcription.createTranscription({language, media_url: "https://example.com/clip.wav", run_audio_cleaning: cleaning, formatting_options: {max_characters_in_segment: 40}});
                const result = raw ? (await pending.withRawResponse()).data : await pending;
                assert.equal(result.task_id, "test-task");
                const {url, init} = requests[0];
                assert.ok(url.endsWith("/transcribe"));
                const form = await new Request(url, init).formData();
                assert.equal(form.get("language"), String(language));
                assert.equal(form.get("run_audio_cleaning"), cleaning === undefined ? null : String(cleaning));
                assert.equal(JSON.parse(form.get("formatting_options")).max_characters_in_segment, 40);
            });
        }
    }
}

for (const [resource, method, fields] of [
    ["dub", "endToEndDubbing", {video_url: "https://example.com/clip.wav", target_languages: [1]}],
    ["subtitles", "createSubtitle", {media_url: "https://example.com/clip.wav", target_languages: [1]}],
    ["translation", "createTranslation", {texts: ["hello"], target_language: 1}],
]) {
    test(`${resource} preserves auto in JSON`, async () => {
        let body;
        const client = new CambClient({apiKey: "test", fetch: async (_url, init) => {
            body = JSON.parse(init.body);
            return new Response(JSON.stringify({task_id: "test-task"}), {status: 200, headers: {"content-type": "application/json"}});
        }});
        await client[resource][method]({...fields, source_language: "auto"});
        assert.equal(body.source_language, "auto");
    });
}
