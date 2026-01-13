import * as core from "../../../../core/index.js";
import { getBinaryResponse } from "../../../../core/fetcher/BinaryResponse.js";
import * as CambApi from "../../../index.js";

/**
 * Baseten TTS provider implementation.
 * 
 * Makes a request to Baseten's mars-pro endpoint with the provided parameters.
 * Requires `api_key` and `mars_pro_url` in providerParams.
 * Requires `reference_audio` and `reference_language` in additional_body_parameters.
 */
export async function basetenTts(
    request: CambApi.CreateStreamTtsRequestPayload & { additional_body_parameters?: Record<string, any> },
    providerParams: Record<string, any>,
    requestOptions?: any,
): Promise<core.WithRawResponse<core.BinaryResponse>> {
    // Note: Baseten provider only works with mars-pro model
    // We don't validate here since the model is optional in the request

    // Validate provider params
    const { api_key, mars_pro_url } = providerParams;
    if (!api_key || !mars_pro_url) {
        throw new Error("Baseten provider requires 'api_key' and 'mars_pro_url' in providerParams.");
    }

    // Validate additional body parameters
    const additionalParams = request.additional_body_parameters || {};
    if (!additionalParams.reference_audio) {
        throw new Error("reference_audio is required in additional_body_parameters for Baseten provider");
    }
    if (!additionalParams.reference_language) {
        throw new Error("reference_language is required in additional_body_parameters for Baseten provider");
    }

    // Build request payload for Baseten
    const payload: Record<string, any> = {
        text: request.text,
        language: String(request.language).toLowerCase().replace("_", "-"),
        stream: true,
        output_format: "mp3", // default
        apply_ner_nlp: false,
        reference_language: additionalParams.reference_language,
        audio_ref: additionalParams.reference_audio,
        reference_audio: additionalParams.reference_audio,
    };

    // Add output configuration
    if (request.output_configuration?.format) {
        payload.output_format = request.output_configuration.format;
    }

    // Add voice settings
    if (request.voice_settings) {
        if (request.voice_settings.enhance_reference_audio_quality != null) {
            payload.apply_ref_mpsenet = request.voice_settings.enhance_reference_audio_quality;
        }
        if (request.voice_settings.maintain_source_accent) {
            payload.accent_nudge = 0.8;
        }
    }

    // Add inference options
    if (request.inference_options) {
        if (request.inference_options.temperature != null) {
            payload.temperature = request.inference_options.temperature;
        }
        if (request.inference_options.inference_steps != null) {
            payload.inference_steps = request.inference_options.inference_steps;
        }
        if (request.inference_options.speaker_similarity != null) {
            const s = Math.max(0.0, Math.min(0.7, request.inference_options.speaker_similarity));
            payload.campp_speaker_nudge = 1.5 * (1 - s / 0.7);
        }
    }

    // Determine timeout
    const timeout = requestOptions?.timeoutInSeconds
        ? requestOptions.timeoutInSeconds * 1000
        : undefined;

    // Make request to Baseten
    const response = await fetch(mars_pro_url, {
        method: "POST",
        headers: {
            "Authorization": `Api-Key ${api_key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: requestOptions?.abortSignal,
        ...(timeout ? {} : {}), // fetch doesn't support timeout directly
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Baseten API Error: ${response.status} - ${errorText}`);
    }

    return {
        data: getBinaryResponse(response),
        rawResponse: response,
    };
}
