import { describe, it, expect } from "vitest";
import { AcpTypeConverter } from "../src/acp/type-converter";
import type * as acp from "@agentclientprotocol/sdk";

describe("AcpTypeConverter.toToolCallContent", () => {
	it("converts diff and terminal items", () => {
		const result = AcpTypeConverter.toToolCallContent([
			{
				type: "diff",
				path: "a.ts",
				newText: "new",
				oldText: "old",
			},
			{ type: "terminal", terminalId: "term-1" },
		] as acp.ToolCallContent[]);

		expect(result).toEqual([
			{
				type: "diff",
				path: "a.ts",
				newText: "new",
				oldText: "old",
			},
			{ type: "terminal", terminalId: "term-1" },
		]);
	});

	it("converts content text and image blocks used by subagent results", () => {
		const result = AcpTypeConverter.toToolCallContent([
			{
				type: "content",
				content: { type: "text", text: "Explored 4 files" },
			},
			{
				type: "content",
				content: {
					type: "image",
					data: "abc",
					mimeType: "image/png",
				},
			},
		] as acp.ToolCallContent[]);

		expect(result).toEqual([
			{ type: "content", text: "Explored 4 files" },
			{ type: "image", data: "abc", mimeType: "image/png" },
		]);
	});

	it("skips empty or unsupported content blocks", () => {
		const result = AcpTypeConverter.toToolCallContent([
			{ type: "content", content: { type: "text", text: "" } },
			{
				type: "content",
				content: { type: "audio", data: "x", mimeType: "audio/wav" },
			},
		] as acp.ToolCallContent[]);

		expect(result).toBeUndefined();
	});
});
