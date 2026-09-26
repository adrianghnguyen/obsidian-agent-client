/** Device-local hint: Cursor browser login succeeded recently (not a credential store). */
export const CURSOR_SESSION_AUTH_TRUST_KEY = "cursor-session-auth-trust-v1";

export interface CursorSessionAuthTrustAccess {
	load(key: string): unknown;
	save(key: string, data: unknown): void;
}

export function cursorSessionAuthTrustFromApp(app: {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}): CursorSessionAuthTrustAccess {
	return {
		load: (key) => app.loadLocalStorage(key),
		save: (key, data) => app.saveLocalStorage(key, data),
	};
}

export function isCursorSessionAuthTrusted(
	storage: CursorSessionAuthTrustAccess,
): boolean {
	return storage.load(CURSOR_SESSION_AUTH_TRUST_KEY) === true;
}

export function setCursorSessionAuthTrusted(
	storage: CursorSessionAuthTrustAccess,
	trusted: boolean,
): void {
	if (trusted) {
		storage.save(CURSOR_SESSION_AUTH_TRUST_KEY, true);
	} else {
		storage.save(CURSOR_SESSION_AUTH_TRUST_KEY, null);
	}
}
