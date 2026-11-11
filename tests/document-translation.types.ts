import { CambApi, CambClient } from "../dist/index.js";

const client = new CambClient({ apiKey: "test-key" });

const request: CambApi.BodyCreateDocTranslationTranslateDocPost = {
    source_language: CambApi.Languages.EN_US,
    target_language: "es-es",
    media_url: "https://example.com/document.docx",
    chosen_dictionaries: [1, 2],
    translation_style: "formal",
};

async function check(): Promise<void> {
    const created: CambApi.CreateDocTranslationOut = await client.translation.createDocTranslation(request);
    const status: CambApi.OrchestratorPipelineResult = await client.translation.getDocTranslationTaskStatus({
        task_id: created.task_id,
    });
    const result: CambApi.DocTranslationResult = await client.translation.getDocTranslationResult({
        run_id: status.run_id ?? 0,
    });
    const url: string = result.download_url;
    void url;
}

void check;
