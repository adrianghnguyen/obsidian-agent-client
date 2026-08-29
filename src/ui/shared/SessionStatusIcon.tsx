import * as React from "react";
const { useRef, useEffect } = React;
import { setIcon } from "obsidian";

import type { SessionStatus } from "../../services/view-registry";

/**
 * Shared session status icon used by Session Manager and floating chat tabs.
 * CSS: `.agent-client-session-status-icon` + `.agent-client-session-status-${status}`
 */
export function SessionStatusIcon({ status }: { status: SessionStatus }) {
	const iconRef = useRef<HTMLSpanElement>(null);

	const iconName = ((s: SessionStatus): string => {
		switch (s) {
			case "ready":
				return "circle-check";
			case "busy":
				return "loader";
			case "permission":
				return "shield-alert";
			case "error":
				return "circle-x";
			case "disconnected":
				return "circle-off";
		}
	})(status);

	useEffect(() => {
		if (iconRef.current) setIcon(iconRef.current, iconName);
	}, [iconName]);

	return (
		<span
			ref={iconRef}
			className={`agent-client-session-status-icon agent-client-session-status-${status}`}
		/>
	);
}

/** Short label for tooltips (e.g. floating tab title). */
export function sessionStatusLabel(status: SessionStatus): string {
	switch (status) {
		case "ready":
			return "Ready";
		case "busy":
			return "Busy";
		case "permission":
			return "Needs permission";
		case "error":
			return "Error";
		case "disconnected":
			return "Disconnected";
	}
}
