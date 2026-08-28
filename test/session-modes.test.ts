import { describe, it, expect } from "vitest";
import {
	findModeConfigOption,
	listAdvertisedSessionModes,
	getCurrentModeId,
	nextAdvertisedMode,
	getSessionModePillClass,
} from "../src/services/session-modes";
import type {
	SessionConfigOption,
	SessionModeState,
} from "../src/types/session";

const legacyModes: SessionModeState = {
	currentModeId: "agent",
	availableModes: [
		{ id: "agent", name: "Agent", description: "Full tool access" },
		{ id: "plan", name: "Plan" },
		{ id: "ask", name: "Ask" },
	],
};

const modeOption: SessionConfigOption = {
	id: "mode",
	name: "Mode",
	type: "select",
	currentValue: "plan",
	options: [
		{ value: "agent", name: "Agent" },
		{ value: "plan", name: "Plan" },
		{ value: "ask", name: "Ask" },
	],
};

const modelOption: SessionConfigOption = {
	id: "model",
	name: "Model",
	type: "select",
	currentValue: "fast",
	options: [
		{ value: "fast", name: "Fast" },
		{ value: "slow", name: "Slow" },
	],
};

describe("listAdvertisedSessionModes", () => {
	it("uses config option id=mode when present", () => {
		const listed = listAdvertisedSessionModes(legacyModes, [
			modelOption,
			modeOption,
		]);
		expect(listed.map((m) => m.id)).toEqual(["agent", "plan", "ask"]);
		expect(listed[0].source).toEqual({ type: "config", configId: "mode" });
	});

	it("falls back to legacy availableModes", () => {
		const listed = listAdvertisedSessionModes(legacyModes, [modelOption]);
		expect(listed.map((m) => m.id)).toEqual(["agent", "plan", "ask"]);
		expect(listed[0].source).toEqual({ type: "legacy" });
	});

	it("returns empty when the agent advertises no modes", () => {
		expect(listAdvertisedSessionModes(undefined, [modelOption])).toEqual(
			[],
		);
	});
});

describe("nextAdvertisedMode", () => {
	it("cycles to the next advertised mode", () => {
		const listed = listAdvertisedSessionModes(legacyModes);
		expect(nextAdvertisedMode(listed, "agent")?.id).toBe("plan");
		expect(nextAdvertisedMode(listed, "ask")?.id).toBe("agent");
	});

	it("returns undefined when there is nothing to cycle", () => {
		expect(nextAdvertisedMode([], "agent")).toBeUndefined();
		expect(
			nextAdvertisedMode(
				[{ id: "only", name: "Only", source: { type: "legacy" } }],
				"only",
			),
		).toBeUndefined();
	});
});

describe("getCurrentModeId", () => {
	it("reads current value from the mode config option", () => {
		const listed = listAdvertisedSessionModes(undefined, [modeOption]);
		expect(getCurrentModeId(listed, undefined, [modeOption])).toBe("plan");
	});

	it("reads current value from legacy modes", () => {
		const listed = listAdvertisedSessionModes(legacyModes);
		expect(getCurrentModeId(listed, legacyModes)).toBe("agent");
	});
});

describe("findModeConfigOption", () => {
	it("matches category=mode", () => {
		const option: SessionConfigOption = {
			id: "session_mode",
			name: "Session",
			category: "mode",
			type: "select",
			currentValue: "code",
			options: [{ value: "code", name: "Code" }],
		};
		expect(findModeConfigOption([option])?.id).toBe("session_mode");
	});
});

describe("getSessionModePillClass", () => {
	it("returns plan and ask classes", () => {
		expect(getSessionModePillClass("plan")).toBe("agent-client-mode-plan");
		expect(getSessionModePillClass("Plan")).toBe("agent-client-mode-plan");
		expect(getSessionModePillClass("ask")).toBe("agent-client-mode-ask");
		expect(getSessionModePillClass("Ask")).toBe("agent-client-mode-ask");
	});

	it("returns undefined for agent and unknown modes", () => {
		expect(getSessionModePillClass("agent")).toBeUndefined();
		expect(getSessionModePillClass("build")).toBeUndefined();
	});
});
