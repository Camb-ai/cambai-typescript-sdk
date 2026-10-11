import { CambApi } from "../dist/index.js";
const request: CambApi.BodyCreateTranscriptionTranscribePost = {language: "auto", run_audio_cleaning: false};
const numeric: CambApi.BodyCreateTranscriptionTranscribePost = {language: CambApi.Languages.EN_US};
const dub: CambApi.EndToEndDubbingRequestPayload = {source_language: "auto", video_url: "https://example.com/v.mp4", target_languages: [CambApi.Languages.EN_US]};
void [request, numeric, dub];
// Every supported create field must be represented; the legacy run_id is a no-op.
const allCreateFields: Record<keyof Omit<CambApi.BodyCreateTranscriptionTranscribePost, "run_id">, true> = {
    language: true, media_file: true, media_url: true, file: true, audio_url: true,
    project_name: true, project_description: true, folder_id: true, transcription_mode: true,
    run_audio_cleaning: true, include_music_in_fg: true, formatting_options: true, traceparent: true,
};
const controls: CambApi.BodyCreateTranscriptionTranscribePost = {
    language: "auto", include_music_in_fg: false, run_audio_cleaning: false,
    formatting_options: '{"max_characters_in_segment":40}', traceparent: "trace",
};
void [allCreateFields, controls];
