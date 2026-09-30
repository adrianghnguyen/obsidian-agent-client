import * as React from "react";
const { useRef, useEffect, useMemo } = React;
import { setIcon, DropdownComponent } from "obsidian";

import type { AgentDisplayInfo } from "../../services/session-helpers";

/** Stable empty list for the pinned-agent case (no switchable agents). */
const EMPTY_AGENTS: AgentDisplayInfo[] = [];

/**
 * Selector options = enabled agents, plus the active agent appended as an
 * explicit "(disabled)" option when it is not in the enabled enumeration
 * (kept session or pinned block on a disabled agent). Without it the
 * dropdown's setValue silently no-ops and the selector renders blank.
 * Returns `availableAgents` by reference when no append is needed, so the
 * dropdown-rebuild effect doesn't re-run on ordinary agent switches.
 */
export function useSelectorAgents(
	availableAgents: AgentDisplayInfo[] | undefined,
	currentAgentId: string | undefined,
	agentLabel: string,
): AgentDisplayInfo[] {
	return useMemo(() => {
		if (!availableAgents) return EMPTY_AGENTS;
		if (
			!currentAgentId ||
			availableAgents.some((agent) => agent.id === currentAgentId)
		) {
			return availableAgents;
		}
		return [
			...availableAgents,
			{ id: currentAgentId, displayName: `${agentLabel} (disabled)` },
		];
	}, [availableAgents, currentAgentId, agentLabel]);
}

/**
 * Native Obsidian dropdown for switching the active agent, followed by the
 * chevron affordance. Renders the plain label when there is nothing to switch
 * between, so the sidebar and floating headers read the same in both states.
 */
export function AgentSelector({
	availableAgents,
	currentAgentId,
	agentLabel,
	onAgentChange,
}: {
	availableAgents: AgentDisplayInfo[] | undefined;
	currentAgentId: string | undefined;
	agentLabel: string;
	onAgentChange: (agentId: string) => void;
}) {
	const dropdownRef = useRef<HTMLDivElement>(null);
	const dropdownInstance = useRef<DropdownComponent | null>(null);
	const onChangeRef = useRef(onAgentChange);
	onChangeRef.current = onAgentChange;

	const selectorAgents = useSelectorAgents(
		availableAgents,
		currentAgentId,
		agentLabel,
	);

	useEffect(() => {
		const containerEl = dropdownRef.current;
		if (!containerEl) return;

		if (selectorAgents.length <= 1) {
			if (dropdownInstance.current) {
				containerEl.empty();
				dropdownInstance.current = null;
			}
			return;
		}

		if (!dropdownInstance.current) {
			const dropdown = new DropdownComponent(containerEl);
			dropdownInstance.current = dropdown;
			for (const agent of selectorAgents) {
				dropdown.addOption(agent.id, agent.displayName);
			}
			if (currentAgentId) dropdown.setValue(currentAgentId);
			dropdown.onChange((value) => onChangeRef.current(value));
		}

		return () => {
			if (dropdownInstance.current) {
				containerEl.empty();
				dropdownInstance.current = null;
			}
		};
	}, [selectorAgents, currentAgentId]);

	useEffect(() => {
		if (dropdownInstance.current && currentAgentId) {
			dropdownInstance.current.setValue(currentAgentId);
		}
	}, [currentAgentId]);

	if (selectorAgents.length > 1) {
		return (
			<div className="agent-client-agent-selector">
				<div ref={dropdownRef} />
				<span
					className="agent-client-agent-selector-icon"
					ref={(el) => {
						if (el) setIcon(el, "chevron-down");
					}}
				/>
			</div>
		);
	}

	return <span className="agent-client-agent-label">{agentLabel}</span>;
}
