import * as React from "react";
const { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } =
	React;
import { createPortal } from "react-dom";
import { setIcon } from "obsidian";

import {
	buildVisibleModelRows,
	emptyModelMatchMessage,
	filterModelOptions,
	findLabelHighlightRanges,
	handleModelSearchKey,
	visibleModelValues,
	type ModelSelectItem,
} from "../utils/model-select-search";

export interface SearchableModelDropdownProps {
	label: string;
	title: string;
	items: ModelSelectItem[];
	currentValue: string | undefined;
	onChange: (value: string) => void;
	className?: string;
}

function HighlightedLabel({
	text,
	query,
}: {
	text: string;
	query: string;
}): React.ReactElement {
	const ranges = findLabelHighlightRanges(text, query);
	if (ranges.length === 0) {
		return <>{text}</>;
	}
	const parts: React.ReactNode[] = [];
	let cursor = 0;
	ranges.forEach(([start, end], index) => {
		if (start > cursor) {
			parts.push(text.slice(cursor, start));
		}
		parts.push(
			<span
				key={`${start}-${end}-${index}`}
				className="agent-client-model-search-match"
			>
				{text.slice(start, end)}
			</span>,
		);
		cursor = end;
	});
	if (cursor < text.length) {
		parts.push(text.slice(cursor));
	}
	return <>{parts}</>;
}

/**
 * Model chip that opens a searchable popover when the session lists
 * more than 10 models. Arrow/Enter/Escape are handled on the search
 * field only — never registered as plugin commands.
 */
export function SearchableModelDropdown({
	label,
	title,
	items,
	currentValue,
	onChange,
	className,
}: SearchableModelDropdownProps) {
	const buttonRef = useRef<HTMLButtonElement>(null);
	const chevronRef = useRef<HTMLSpanElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState<string | null>(null);
	const [pickedValue, setPickedValue] = useState<string | undefined>(
		currentValue,
	);

	useEffect(() => {
		setPickedValue(currentValue);
	}, [currentValue]);

	useEffect(() => {
		if (chevronRef.current) {
			setIcon(chevronRef.current, "chevron-down");
		}
	}, []);

	const filtered = useMemo(
		() => filterModelOptions(items, query),
		[items, query],
	);
	const rows = useMemo(() => buildVisibleModelRows(filtered), [filtered]);
	const values = useMemo(() => visibleModelValues(rows), [rows]);

	const closeMenu = useCallback(() => {
		setOpen(false);
		setQuery("");
		setHighlighted(null);
	}, []);

	const selectValue = useCallback(
		(value: string) => {
			setPickedValue(value);
			onChange(value);
			closeMenu();
		},
		[onChange, closeMenu],
	);

	useLayoutEffect(() => {
		if (!open) return;
		searchRef.current?.focus();
		const popover = popoverRef.current;
		const anchor = buttonRef.current?.getBoundingClientRect();
		if (!popover || !anchor) return;
		const gap = 6;
		const margin = 8;
		const width = Math.min(320, window.innerWidth - margin * 2);
		let left = anchor.left;
		left = Math.max(
			margin,
			Math.min(left, window.innerWidth - width - margin),
		);
		const bottom = window.innerHeight - anchor.top + gap;
		const maxHeight = Math.max(120, anchor.top - margin - gap);
		popover.style.setProperty("--ac-model-search-left", `${left}px`);
		popover.style.setProperty("--ac-model-search-bottom", `${bottom}px`);
		popover.style.setProperty("--ac-model-search-width", `${width}px`);
		popover.style.setProperty(
			"--ac-model-search-max-height",
			`${maxHeight}px`,
		);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const onDocMouseDown = (event: MouseEvent) => {
			const target = event.target as Node | null;
			if (!target) return;
			if (buttonRef.current?.contains(target)) return;
			if (popoverRef.current?.contains(target)) return;
			closeMenu();
		};
		const doc = buttonRef.current?.ownerDocument ?? document;
		doc.addEventListener("mousedown", onDocMouseDown);
		return () => {
			doc.removeEventListener("mousedown", onDocMouseDown);
		};
	}, [open, closeMenu]);

	useEffect(() => {
		if (!open || !highlighted) return;
		const selected = popoverRef.current?.querySelector(
			".agent-client-model-search-option.is-highlighted",
		);
		selected?.scrollIntoView({ block: "nearest" });
	}, [open, highlighted]);

	const chipValue = pickedValue ?? currentValue;
	const chipLabel =
		items.find((item) => item.value === chipValue)?.label ?? label;

	const onSearchKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			const action = handleModelSearchKey({
				key: event.key,
				visibleValues: values,
				highlighted,
				currentValue: chipValue,
			});
			if (action.type === "none") return;
			event.preventDefault();
			event.stopPropagation();
			if (action.type === "close") {
				closeMenu();
				return;
			}
			if (action.type === "highlight") {
				setHighlighted(action.value);
				return;
			}
			if (action.type === "select") {
				selectValue(action.value);
			}
		},
		[values, highlighted, chipValue, closeMenu, selectValue],
	);

	const wrapperClass = ["agent-client-toolbar-dropdown", className]
		.filter(Boolean)
		.join(" ");

	const popover = open
		? createPortal(
				<div
					ref={popoverRef}
					className="agent-client-model-search-popover"
					role="listbox"
					aria-label={title}
				>
					<input
						ref={searchRef}
						type="search"
						className="agent-client-model-search-input"
						placeholder="Search models"
						value={query}
						aria-label="Search models"
						onChange={(event) => {
							setQuery(event.target.value);
							setHighlighted(null);
						}}
						onKeyDown={onSearchKeyDown}
					/>
					<div className="agent-client-model-search-list">
						{filtered.length === 0 ? (
							<div className="agent-client-model-search-empty">
								{emptyModelMatchMessage(query)}
							</div>
						) : (
							rows.map((row) => {
								if (row.kind === "header") {
									return (
										<div
											key={`header-${row.name}`}
											className="agent-client-model-search-header"
										>
											{row.name}
										</div>
									);
								}
								const selected = row.item.value === chipValue;
								const isHighlighted =
									row.item.value === highlighted;
								return (
									<button
										key={row.item.value}
										type="button"
										role="option"
										aria-selected={selected}
										className={[
											"agent-client-model-search-option",
											selected ? "is-checked" : undefined,
											isHighlighted
												? "is-highlighted"
												: undefined,
										]
											.filter(Boolean)
											.join(" ")}
										onMouseEnter={() => {
											setHighlighted(row.item.value);
										}}
										onClick={() => {
											selectValue(row.item.value);
										}}
									>
										<span className="agent-client-model-search-option-label">
											<HighlightedLabel
												text={row.item.label}
												query={query}
											/>
										</span>
									</button>
								);
							})
						)}
					</div>
				</div>,
				(buttonRef.current?.ownerDocument ?? document).body,
			)
		: null;

	return (
		<>
			<button
				ref={buttonRef}
				type="button"
				className={wrapperClass}
				title={title}
				aria-expanded={open}
				aria-haspopup="listbox"
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					if (open) {
						closeMenu();
						return;
					}
					setQuery("");
					setHighlighted(null);
					setOpen(true);
				}}
			>
				<span className="agent-client-toolbar-dropdown-label-area">
					{items.map((item) => (
						<span
							key={item.value}
							className="agent-client-toolbar-dropdown-sizer"
						>
							{item.label}
						</span>
					))}
					<span className="agent-client-toolbar-dropdown-label">
						{chipLabel}
					</span>
				</span>
				<span
					ref={chevronRef}
					className="agent-client-toolbar-dropdown-chevron"
					aria-hidden="true"
				/>
			</button>
			{popover}
		</>
	);
}
