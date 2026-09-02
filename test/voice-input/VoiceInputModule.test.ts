import { describe, it, expect, vi, beforeEach } from "vitest";
import { VoiceInputModule } from "../../src/voice-input/VoiceInputModule";
import { createFakeSocket, createFakeRecorder, createFakeSink } from "./fixtures";
import { LiveTranscriber } from "../../src/voice-input/LiveTranscriber";
import type { TranscriptSink } from "../../src/voice-input/types";
import type { VoiceInputSettings } from "../../src/voice-input/VoiceInputSettings";

function createPluginStub(overrides: {
	secretStorageGet?: string | null;
} = {}): Plugin {
	return {
		addCommand: vi.fn(),
		app: {
			secretStorage: {
				getSecret: vi.fn(() => overrides.secretStorageGet ?? null),
				setSecret: vi.fn(),
			},
			workspace: { trigger: vi.fn() },
		},
	} as unknown as Plugin;
}

const TEST_SETTINGS: VoiceInputSettings = {
	enabled: true,
	geminiApiKeySecretId: "agent-client-gemini-live-api-key",
	model: "gemini-3.5-transcribe-live",
	transcriptionMode: "smart",
	languageCodes: "",
	customVocabulary: "",
	audioDeviceId: "default",
};

describe("VoiceInputModule", () => {
	let module: VoiceInputModule;
	let plugin: Plugin;
	let sink: TranscriptSink;
	let fakeTranscriber: LiveTranscriber;
	let socketBundle: ReturnType<typeof createFakeSocket>;

	beforeEach(() => {
		plugin = createPluginStub({ secretStorageGet: "test-key" });
		sink = createFakeSink();

		socketBundle = createFakeSocket();
		const recorder = createFakeRecorder();
		fakeTranscriber = new LiveTranscriber("key", "model", {
			createSocket: () => socketBundle.socket,
			audioSource: recorder,
		});

		// Inject the fake transcriber via the factory parameter
		module = new VoiceInputModule(
			plugin,
			{ ...TEST_SETTINGS },
			() => fakeTranscriber,
		);
	});

	it("is idle after construction", () => {
		expect(module.isListening).toBe(false);
	});

	it("refuses to start without API key via onError", async () => {
		const noKeyPlugin = createPluginStub({ secretStorageGet: null });
		const noKeyModule = new VoiceInputModule(
			noKeyPlugin,
			{ ...TEST_SETTINGS },
			() => fakeTranscriber,
		);
		await noKeyModule.startListening(sink);
		expect(sink.onError).toHaveBeenCalledWith(
			"Add your Gemini API key in Voice Input settings",
		);
		expect(noKeyModule.isListening).toBe(false);
	});

	it("startListening delegates to the transcriber", async () => {
		const startPromise = module.startListening(sink);
		socketBundle.socket.onopen?.();
		socketBundle.socket.onmessage?.({
			data: JSON.stringify({ setupComplete: true }),
		});
		await startPromise;
		expect(module.isListening).toBe(true);
	});

	it("stopListening is safe when not listening", async () => {
		await module.stopListening();
		expect(module.isListening).toBe(false);
	});

	it("dispose cleans up", () => {
		module.dispose();
		expect(module.isListening).toBe(false);
	});

	it("updateSettings stores new settings", () => {
		const newSettings = { ...TEST_SETTINGS, model: "gemini-3.0-flash-live" };
		module.updateSettings(newSettings);
	});

	it("registerCommands adds a command", () => {
		module.registerCommands();
		expect(plugin.addCommand).toHaveBeenCalledWith(
			expect.objectContaining({ id: "voice-input-toggle" }),
		);
	});
});