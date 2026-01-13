import * as fs from 'node:fs';

/**
 * Saves an async byte stream or BinaryResponse to a file.
 * 
 * @param stream - The async byte stream or BinaryResponse to save
 * @param filename - The name of the file to save the stream to
 * @returns Promise that resolves when the file is written
 * 
 * @example
 * ```typescript
 * import { CambApiClient, saveStreamToFile } from '@camb-ai/sdk';
 * 
 * const client = new CambApiClient({ apiKey: 'YOUR_API_KEY' });
 * const response = await client.textToSpeech.tts({
 *   text: 'Hello world',
 *   language: 'en-us',
 *   speech_model: 'mars-pro',
 *   voice_id: 20303
 * });
 * 
 * await saveStreamToFile(response, 'output.mp3');
 * ```
 */
export async function saveStreamToFile(
    stream: AsyncIterable<Uint8Array> | { stream: () => ReadableStream<Uint8Array> | null },
    filename: string
): Promise<void> {
    const writeStream = fs.createWriteStream(filename);

    try {
        // Check if it's a BinaryResponse with a stream() method
        if (typeof stream === 'object' && stream !== null && 'stream' in stream && typeof stream.stream === 'function') {
            const readableStream = stream.stream();
            if (!readableStream) {
                throw new Error('Stream is null');
            }

            const reader = readableStream.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    writeStream.write(value);
                }
            } finally {
                reader.releaseLock();
            }
        } else {
            // Handle async iterable
            for await (const chunk of stream as AsyncIterable<Uint8Array>) {
                writeStream.write(chunk);
            }
        }
    } finally {
        writeStream.end();

        // Wait for the stream to finish
        await new Promise<void>((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
    }
}
