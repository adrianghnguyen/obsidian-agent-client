import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
export const SAMPLE_SPEECH_WAV = join(
	FIXTURE_DIR,
	"fixtures",
	"sample-speech.wav",
);

/** Write a short mono 16 kHz PCM WAV (sine tone ≈ speech energy). */
export function ensureSampleSpeechWav(path = SAMPLE_SPEECH_WAV): string {
	mkdirSync(dirname(path), { recursive: true });
	if (existsSync(path)) return path;

	const sampleRate = 16000;
	const durationSec = 1.2;
	const numSamples = Math.floor(sampleRate * durationSec);
	const dataSize = numSamples * 2;
	const buffer = Buffer.alloc(44 + dataSize);

	buffer.write("RIFF", 0);
	buffer.writeUInt32LE(36 + dataSize, 4);
	buffer.write("WAVE", 8);
	buffer.write("fmt ", 12);
	buffer.writeUInt32LE(16, 16);
	buffer.writeUInt16LE(1, 20); // PCM
	buffer.writeUInt16LE(1, 22); // mono
	buffer.writeUInt32LE(sampleRate, 24);
	buffer.writeUInt32LE(sampleRate * 2, 28);
	buffer.writeUInt16LE(2, 32);
	buffer.writeUInt16LE(16, 34);
	buffer.write("data", 36);
	buffer.writeUInt32LE(dataSize, 40);

	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		// Amplitude envelope + dual tone so levels are non-zero
		const env = Math.min(1, t * 4) * Math.min(1, (durationSec - t) * 4);
		const sample =
			Math.sin(2 * Math.PI * 220 * t) * 0.35 * env +
			Math.sin(2 * Math.PI * 440 * t) * 0.2 * env;
		const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
		buffer.writeInt16LE(int16, 44 + i * 2);
	}

	writeFileSync(path, buffer);
	return path;
}

/**
 * Decode a mono 16-bit PCM WAV into base64 PCM chunks (4096 samples ≈ AudioCapture).
 */
export function loadWavAsPcmChunks(
	path = SAMPLE_SPEECH_WAV,
	samplesPerChunk = 4096,
): string[] {
	ensureSampleSpeechWav(path);
	const buf = readFileSync(path);
	if (buf.toString("ascii", 0, 4) !== "RIFF") {
		throw new Error("Not a RIFF WAV: " + path);
	}
	let offset = 12;
	let dataOffset = -1;
	let dataSize = 0;
	while (offset + 8 <= buf.length) {
		const id = buf.toString("ascii", offset, offset + 4);
		const size = buf.readUInt32LE(offset + 4);
		if (id === "data") {
			dataOffset = offset + 8;
			dataSize = size;
			break;
		}
		offset += 8 + size + (size % 2);
	}
	if (dataOffset < 0) throw new Error("WAV missing data chunk: " + path);

	const pcm = buf.subarray(dataOffset, dataOffset + dataSize);
	const chunks: string[] = [];
	const bytesPerChunk = samplesPerChunk * 2;
	for (let i = 0; i < pcm.length; i += bytesPerChunk) {
		const slice = pcm.subarray(i, Math.min(i + bytesPerChunk, pcm.length));
		chunks.push(slice.toString("base64"));
	}
	return chunks;
}
