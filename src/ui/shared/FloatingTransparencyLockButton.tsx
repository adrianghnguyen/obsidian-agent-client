import * as React from "react";
import type AgentClientPlugin from "../../plugin";
import { useSettings } from "../../hooks/useSettings";
import { HeaderButton } from "./IconButton";

/**
 * Icon-only header control that locks every floating chat fully opaque
 * (ignores the idle fade timer) or restores idle transparency.
 *
 * Hidden when idle delay is 0 (fade already off globally). Persisted lock
 * still applies if delay later becomes > 0.
 */
export function FloatingTransparencyLockButton({
	plugin,
	className,
}: {
	plugin: AgentClientPlugin;
	className?: string;
}): React.ReactElement | null {
	const { floatingIdleTimeoutMs, floatingTransparencyMode } =
		useSettings(plugin);

	if (floatingIdleTimeoutMs <= 0) {
		return null;
	}

	const lockedOpaque = !floatingTransparencyMode;

	return (
		<HeaderButton
			iconName={lockedOpaque ? "droplet-off" : "droplet"}
			tooltip={
				lockedOpaque
					? "Enable transparency mode"
					: "Disable transparency mode"
			}
			pressed={lockedOpaque}
			className={[
				"agent-client-transparency-lock",
				className,
			]
				.filter(Boolean)
				.join(" ")}
			onClick={() => {
				void plugin.settingsService.updateSettings({
					floatingTransparencyMode: lockedOpaque,
				});
			}}
		/>
	);
}
