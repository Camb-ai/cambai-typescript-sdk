import assert from "node:assert/strict";
import test from "node:test";
import { CambClient } from "../dist/index.js";
const traceparent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01";
const transcript = {transcript: [{start: 0, end: 1.5, text: "Hello", speaker: "SPEAKER_0"}]};
function mock(body) {
    const requests = [];
    const client = new CambClient({apiKey: "test", fetch: async (url, init) => {
        requests.push(new Request(url, init));
        return new Response(JSON.stringify(body), {status: 200, headers: {"content-type": "application/json"}});
    }});
    return {client: client.transcription, requests};
}
async function resolve(pending, raw) {return raw ? (await pending.withRawResponse()).data : await pending;}
for (const raw of [false, true]) {
    for (const music of [undefined, false, true]) {
        for (const cleaning of [undefined, false, true]) {
            for (const upload of ["media_file", "file"]) {
                test(`create parity raw=${raw} music=${music} cleaning=${cleaning} upload=${upload}`, async () => {
                    const {client, requests} = mock({task_id: "task"});
                    const fields = {language: "auto", media_url: "https://example.com/a.wav", audio_url: "https://example.com/old.wav",
                        project_name: "Demo", project_description: "Notes", folder_id: 7, transcription_mode: "slow"};
                    const result = await resolve(client.createTranscription({...fields, traceparent, run_id: 99,
                        include_music_in_fg: music, run_audio_cleaning: cleaning,
                        formatting_options: {max_characters_in_segment: 40}, [upload]: new Blob(["RIFFaudio"], {type: "audio/wav"})}), raw);
                    const request = requests[0];
                    const form = await request.formData();
                    assert.equal(new URL(request.url).pathname, "/apis/transcribe");
                    assert.equal(new URL(request.url).search, "");
                    assert.equal(request.headers.get("traceparent"), traceparent);
                    for (const [key, value] of Object.entries(fields)) assert.equal(form.get(key), String(value));
                    assert.equal(form.get("include_music_in_fg"), music === undefined ? null : String(music));
                    assert.equal(form.get("run_audio_cleaning"), cleaning === undefined ? null : String(cleaning));
                    assert.equal(await form.get(upload).text(), "RIFFaudio");
                    assert.deepEqual(JSON.parse(form.get("formatting_options")), {max_characters_in_segment: 40});
                    const expected = [...Object.keys(fields), upload, "formatting_options"];
                    if (music !== undefined) expected.push("include_music_in_fg");
                    if (cleaning !== undefined) expected.push("run_audio_cleaning");
                    assert.deepEqual([...form.keys()].sort(), expected.sort());
                    assert.equal(result.task_id, "task");
                });
            }
        }
    }
    test(`formatting object/string parity raw=${raw}`, async () => {
        const data = {max_segment_duration_in_seconds: 6, min_segment_duration_in_seconds: 1,
            max_characters_in_segment: 40, max_reading_speed_in_cps: 20, min_gap_between_segments_in_frames: 2};
        for (const formatting_options of [data, JSON.stringify(data)]) {
            const {client, requests} = mock({task_id: "task"});
            await resolve(client.createTranscription({language: 1, media_url: "https://example.com/a.wav", formatting_options}), raw);
            assert.deepEqual(JSON.parse((await requests[0].formData()).get("formatting_options")), data);
        }
    });
    test(`status, structured/export/bulk results parity raw=${raw}`, async () => {
        let {client, requests} = mock({status: "SUCCESS", run_id: 7});
        const status = await resolve(client.getTranscriptionTaskStatus({task_id: "task", run_id: 99, traceparent}), raw);
        assert.equal(status.run_id, 7);
        assert.equal(new URL(requests[0].url).pathname, "/apis/transcribe/task");
        assert.equal(new URL(requests[0].url).search, "");
        assert.equal(requests[0].headers.get("traceparent"), traceparent);
        for (const format_type of [undefined, "srt", "vtt", "txt"]) {
            for (const data_type of [undefined, "file", "raw_data"]) {
                const body = format_type || data_type ? {transcript: data_type === "raw_data" ? "Hello" : "https://example.com/result"} : transcript;
                ({client, requests} = mock(body));
                assert.deepEqual(await resolve(client.getTranscriptionResult({run_id: 7, format_type, data_type, word_level_timestamps: true, traceparent}), raw), body);
                const url = new URL(requests[0].url);
                assert.equal(url.pathname, "/apis/transcription-result/7");
                assert.deepEqual(Object.fromEntries(url.searchParams), {...(format_type ? {format_type} : {}), ...(data_type ? {data_type} : {})});
                assert.equal(requests[0].headers.get("traceparent"), traceparent);
            }
        }
        ({client, requests} = mock({"7": transcript, "8": transcript}));
        assert.deepEqual(await resolve(client.getTranscriptionResults({body: {run_ids: [7, 8]}, run_id: 99, traceparent}), raw), {"7": transcript, "8": transcript});
        assert.equal(new URL(requests[0].url).pathname, "/apis/transcription-results");
        assert.equal(new URL(requests[0].url).search, "");
        assert.equal(requests[0].method, "POST");
        assert.deepEqual(await requests[0].json(), {run_ids: [7, 8]});
        assert.equal(requests[0].headers.get("traceparent"), traceparent);
    });
}
for (const raw of [false, true]) {
    test(`transcription preserves validation errors raw=${raw}`, async () => {
        const error = {detail: [{loc: ["body", "language"], msg: "Invalid language", type: "value_error"}]};
        const client = new CambClient({apiKey: "test", fetch: async () => new Response(JSON.stringify(error),
            {status: 422, headers: {"content-type": "application/json"}})});
        const pending = client.transcription.createTranscription({language: "invalid", media_url: "https://example.com/a.wav"});
        await assert.rejects(resolve(pending, raw), actual => {
            assert.equal(actual.statusCode, 422);
            assert.deepEqual(actual.body, error);
            return true;
        });
    });
}
