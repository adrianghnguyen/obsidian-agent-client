/**
 * EngagementLatch — composable “window still in use” holds for floating chat.
 *
 * Idle opacity (and future consumers) treat any active hold as engaged.
 * Features call hold/release with a stable reason string instead of teaching
 * the idle hook about each feature.
 */
export type EngagementReason = string;

/** Well-known reasons used by the plugin. */
export const ENGAGEMENT_VOICE_INPUT = "voice-input";

export class EngagementLatch {
	private holds = new Set<EngagementReason>();
	private listeners = new Set<() => void>();

	/** Mark the window engaged for `reason`. Idempotent for the same reason. */
	hold(reason: EngagementReason): void {
		const sizeBefore = this.holds.size;
		this.holds.add(reason);
		if (this.holds.size !== sizeBefore) {
			this.notify();
		}
	}

	/** Drop the hold for `reason`. No-op if that reason was not held. */
	release(reason: EngagementReason): void {
		if (!this.holds.delete(reason)) return;
		this.notify();
	}

	isHeld(): boolean {
		return this.holds.size > 0;
	}

	has(reason: EngagementReason): boolean {
		return this.holds.has(reason);
	}

	/** Subscribe to hold/release transitions (SettingsService-style). */
	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	private notify(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
