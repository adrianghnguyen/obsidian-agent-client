import * as React from "react";
const { createContext, useContext, useMemo } = React;
import { EngagementLatch } from "../services/engagement-latch";

const FloatingPresenceContext = createContext<EngagementLatch | null>(null);

/**
 * Provides a per-floating-window EngagementLatch (presence holds).
 * Sidebar / embedded chat omit this provider; consumers treat null as no-op.
 */
export function FloatingPresenceProvider({
	latch,
	children,
}: {
	latch: EngagementLatch;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<FloatingPresenceContext.Provider value={latch}>
			{children}
		</FloatingPresenceContext.Provider>
	);
}

/** Engagement latch for the current floating window, or null outside floating. */
export function useFloatingPresence(): EngagementLatch | null {
	return useContext(FloatingPresenceContext);
}

/** Stable latch instance for a floating window root (one per mount). */
export function useCreateFloatingPresenceLatch(): EngagementLatch {
	return useMemo(() => new EngagementLatch(), []);
}
