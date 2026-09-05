import { describe, it, expect } from "vitest";
import { generateEmbedId } from "../src/utils/embed-id";

describe("generateEmbedId", () => {
	it("returns 16 hex characters", () => {
		const id = generateEmbedId();
		expect(id).toMatch(/^[0-9a-f]{16}$/);
	});

	it("returns distinct ids", () => {
		expect(generateEmbedId()).not.toBe(generateEmbedId());
	});
});
