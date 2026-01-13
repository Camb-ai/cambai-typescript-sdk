/**
 * Supported TTS providers for custom provider integration.
 * 
 * - `baseten`: Use Baseten as the TTS provider (requires mars-pro model)
 * - `vertex`: Use Google Vertex AI as the TTS provider
 */
export const TtsProvider = {
    Baseten: "baseten",
    Vertex: "vertex",
} as const;

export type TtsProvider = (typeof TtsProvider)[keyof typeof TtsProvider];
