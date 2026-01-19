# Voice Cloning Examples

Examples demonstrating voice cloning with the Camb AI TypeScript SDK.

## Examples

### 1. Clone Voice (`clone-voice.js`)

Creates a persistent custom voice from a reference audio file that can be reused for future TTS requests.

```bash
# Set your API key and reference audio
export CAMB_API_KEY=your_api_key
export REFERENCE_AUDIO=path/to/your/audio.wav

# Optional: set a custom voice name
export VOICE_NAME=my-custom-voice

# Run the example
npm run clone-voice
```

### 2. TTS with Reference Audio (`tts-with-reference-audio.js`)

Uses reference audio directly for one-off voice cloning during TTS generation (requires Baseten provider).

```bash
# Set Baseten credentials and reference audio
export BASETEN_API_KEY=your_baseten_key
export BASETEN_URL=your_mars_pro_url
export REFERENCE_AUDIO=path/to/your/audio.wav

# Optional: custom text to synthesize
export TEXT="Your custom text here"

# Run the example
npm run tts-with-reference
```

## Setup

```bash
npm install
```

## Reference Audio Guidelines

For best results:

- **Duration**: 10-30 seconds of clear speech
- **Quality**: Clean audio with minimal background noise
- **Format**: WAV, MP3, FLAC, or OGG
- **Content**: Natural conversational speech works best
- **Consistency**: Single speaker throughout the audio

## Voice Settings

When using reference audio, you can customize:

- `enhance_reference_audio_quality`: Improves reference audio quality
- `maintain_source_accent`: Preserves the speaker's accent
- `speaker_similarity`: Controls similarity to reference (0.0-1.0)
- `stability`: Controls output stability (0.0-1.0)
- `temperature`: Controls variation (0.01-4.0)
