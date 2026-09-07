import { describe, it, expect, vi } from "vitest";
import {
	EngagementLatch,
	ENGAGEMENT_VOICE_INPUT,
} from "../src/services/engagement-latch";

describe("EngagementLatch", () => {
	it("is not held initially", () => {
		const latch = new EngagementLatch();
		expect(latch.isHeld()).toBe(false);
		expect(latch.has(ENGAGEMENT_VOICE_INPUT)).toBe(false);
	});

	it("hold makes isHeld true and notifies subscribers", () => {
		const latch = new EngagementLatch();
		const listener = vi.fn();
		latch.subscribe(listener);

		latch.hold(ENGAGEMENT_VOICE_INPUT);
		expect(latch.isHeld()).toBe(true);
		expect(latch.has(ENGAGEMENT_VOICE_INPUT)).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("hold of the same reason is idempotent", () => {
		const latch = new EngagementLatch();
		const listener = vi.fn();
		latch.subscribe(listener);

		latch.hold("voice-input");
		latch.hold("voice-input");
		expect(latch.isHeld()).toBe(true);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("release clears the reason and notifies when emptied", () => {
		const latch = new EngagementLatch();
		const listener = vi.fn();
		latch.subscribe(listener);

		latch.hold("voice-input");
		latch.release("voice-input");
		expect(latch.isHeld()).toBe(false);
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("release of an unknown reason is a no-op", () => {
		const latch = new EngagementLatch();
		const listener = vi.fn();
		latch.subscribe(listener);

		latch.release("missing");
		expect(listener).not.toHaveBeenCalled();
	});

	it("stays held while any reason remains", () => {
		const latch = new EngagementLatch();
		latch.hold("voice-input");
		latch.hold("agent-streaming");
		latch.release("voice-input");
		expect(latch.isHeld()).toBe(true);
		expect(latch.has("agent-streaming")).toBe(true);

		latch.release("agent-streaming");
		expect(latch.isHeld()).toBe(false);
	});

	it("subscribe returns an unsubscribe that stops notifications", () => {
		const latch = new EngagementLatch();
		const listener = vi.fn();
		const unsub = latch.subscribe(listener);
		unsub();
		latch.hold("voice-input");
		expect(listener).not.toHaveBeenCalled();
	});
});
