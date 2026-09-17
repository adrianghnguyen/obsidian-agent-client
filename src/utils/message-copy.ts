import type { MessageContent } from "../types/chat";

/**
 * Plain text for clipboard copy: visible reply/user text only
 * (not thoughts, tools, or the Hidden buffer).
 */
export function extractTextContent(contents: MessageContent[]): string {
	return contents
		.filter((c) => c.type === "text" || c.type === "text_with_context")
		.map((c) => c.text)
		.filter((text) => text.length > 0)
		.join("\n");
}

export function hasCopyableText(contents: MessageContent[]): boolean {
	return extractTextContent(contents).length > 0;
}
