import type { ChatMessage } from "../types/chat";
import type { ErrorInfo } from "../types/errors";

/** Insert a connection failure into the chat transcript (assistant bubble). */
export function errorInfoToChatMessage(error: ErrorInfo): ChatMessage {
	return {
		id: crypto.randomUUID(),
		role: "assistant",
		content: [
			{
				type: "connection_error",
				title: error.title,
				message: error.message,
				suggestion: error.suggestion,
				link: error.link,
			},
		],
		timestamp: new Date(),
	};
}
