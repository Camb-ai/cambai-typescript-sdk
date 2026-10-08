import { CambApi } from "../dist/index.js";
const request: CambApi.BodyCreateTranscriptionTranscribePost = {language: "auto", run_audio_cleaning: false};
const numeric: CambApi.BodyCreateTranscriptionTranscribePost = {language: CambApi.Languages.EN_US};
const dub: CambApi.EndToEndDubbingRequestPayload = {source_language: "auto", video_url: "https://example.com/v.mp4", target_languages: [CambApi.Languages.EN_US]};
void [request, numeric, dub];
