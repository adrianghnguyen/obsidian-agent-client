export {};

/**
 * Type augmentation for unofficial Obsidian APIs.
 *
 * These methods exist at runtime but are not in the public type definitions.
 * Only add methods that are widely used by the plugin community and unlikely
 * to be removed without notice.
 */
declare module "obsidian" {
	interface App {
		loadLocalStorage(key: string): unknown;
		saveLocalStorage(key: string, data: unknown | null): void;
	}

	interface Vault {
		getConfig(key: string): unknown;
	}

	interface MenuItem {
		/** Root element for this menu row (public at runtime). */
		dom: HTMLElement;
	}
}
