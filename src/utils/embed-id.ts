/** Short device-neutral block id for persist embedded chats. */
export function generateEmbedId(): string {
	return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}
