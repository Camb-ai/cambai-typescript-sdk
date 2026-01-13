import * as core from "../../../../core/index.js";
import * as CambApi from "../../../index.js";

/**
 * Vertex AI TTS provider implementation (placeholder).
 * 
 * This is a placeholder for future Vertex AI integration.
 */
export async function vertexTts(
    request: CambApi.CreateStreamTtsRequestPayload,
    providerParams: Record<string, any>,
    requestOptions?: any,
): Promise<core.WithRawResponse<core.BinaryResponse>> {
    throw new Error("Vertex AI provider is not yet implemented. Please use 'baseten' or the default Camb.ai provider.");
}
