import assert from "node:assert/strict";
import test from "node:test";
import { CambApi, CambClient } from "../dist/index.js";

function mockClient(status = 200, responseBody = { task_id: "doc-task", run_id: 42 }) {
    const requests = [];
    const client = new CambClient({
        apiKey: "test-key",
        fetch: async (url, init) => {
            const body = init.body instanceof FormData ? init.body : undefined;
            requests.push({ url: String(url), init, form: body });
            return new Response(JSON.stringify(responseBody), {
                status,
                headers: { "content-type": "application/json" },
            });
        },
    });
    return { client, requests };
}

for (const raw of [false, true]) {
    const label = raw ? "raw" : "normal";
    const run = (pending) => (raw ? pending.withRawResponse().then((r) => r.data) : pending);

    test(`${label}: create with file upload sends multipart with media_file and form fields`, async () => {
        const { client, requests } = mockClient();
        const file = new Blob(["1\n00:00:01,000 --> 00:00:02,000\nHello\n"], { type: "application/x-subrip" });
        const result = await run(
            client.translation.createDocTranslation({
                source_language: CambApi.Languages.EN_US,
                target_language: "es-es",
                media_file: file,
                project_name: "Doc project",
                folder_id: 7,
                chosen_dictionaries: [3, 5],
                translation_style: "formal",
            }),
        );
        assert.deepEqual(result, { task_id: "doc-task", run_id: 42 });
        assert.equal(requests.length, 1);
        const { url, init, form } = requests[0];
        assert.equal(init.method, "POST");
        assert.ok(url.endsWith("/translate-doc"));
        assert.ok(form, "body should be FormData");
        assert.equal(form.get("source_language"), "1");
        assert.equal(form.get("target_language"), "es-es");
        assert.ok(form.get("media_file") instanceof Blob);
        assert.equal(form.get("project_name"), "Doc project");
        assert.equal(form.get("folder_id"), "7");
        assert.deepEqual(form.getAll("chosen_dictionaries"), ["3", "5"]);
        assert.equal(form.get("translation_style"), "formal");
        assert.equal(form.has("media_url"), false);
        assert.equal(form.has("project_description"), false);
    });

    test(`${label}: create with media_url sends no file part`, async () => {
        const { client, requests } = mockClient(200, { task_id: "doc-task" });
        const result = await run(
            client.translation.createDocTranslation({
                source_language: 1,
                target_language: CambApi.Languages.ES_ES,
                media_url: "https://example.com/document.docx",
                chosen_dictionaries: null,
            }),
        );
        assert.equal(result.task_id, "doc-task");
        const { form } = requests[0];
        assert.equal(form.get("media_url"), "https://example.com/document.docx");
        assert.equal(form.get("target_language"), String(CambApi.Languages.ES_ES));
        assert.equal(form.has("media_file"), false);
        assert.equal(form.has("chosen_dictionaries"), false);
    });

    test(`${label}: task status hits /translate-doc/{task_id}`, async () => {
        const { client, requests } = mockClient(200, { status: "SUCCESS", run_id: 42 });
        const result = await run(client.translation.getDocTranslationTaskStatus({ task_id: "abc/123" }));
        assert.equal(result.status, "SUCCESS");
        assert.equal(result.run_id, 42);
        assert.equal(requests[0].init.method, "GET");
        assert.ok(requests[0].url.endsWith("/translate-doc/abc%2F123"));
    });

    test(`${label}: result hits /translate-doc-result/{run_id}`, async () => {
        const { client, requests } = mockClient(200, { download_url: "https://example.com/out.docx" });
        const result = await run(client.translation.getDocTranslationResult({ run_id: 42 }));
        assert.equal(result.download_url, "https://example.com/out.docx");
        assert.equal(requests[0].init.method, "GET");
        assert.ok(requests[0].url.endsWith("/translate-doc-result/42"));
    });

    test(`${label}: 422 raises UnprocessableEntityError`, async () => {
        const body = { detail: [{ loc: ["body", "source_language"], msg: "Field required", type: "missing" }] };
        const { client } = mockClient(422, body);
        await assert.rejects(
            run(
                client.translation.createDocTranslation({
                    source_language: 1,
                    target_language: 54,
                    media_url: "https://example.com/document.docx",
                }),
            ),
            (error) => {
                assert.ok(error instanceof CambApi.UnprocessableEntityError);
                assert.equal(error.statusCode, 422);
                assert.deepEqual(error.body, body);
                return true;
            },
        );
    });
}
