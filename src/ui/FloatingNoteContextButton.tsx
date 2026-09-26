import type { FloatingNoteContextIconId } from "../services/floating-note-context";

const FILE_PATH =
	"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z";
const FILE_FOLD = "M14 2v4a2 2 0 0 0 2 2h4";
const INFINITY_PATH =
	"M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z";

function FloatingNoteContextGlyph({ id }: { id: FloatingNoteContextIconId }) {
	if (id === "x") {
		return (
			<svg
				viewBox="0 0 24 24"
				aria-hidden="true"
				className="agent-client-floating-note-context-glyph"
			>
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		);
	}

	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className="agent-client-floating-note-context-glyph"
		>
			<g transform="translate(0,2.2) scale(0.68)">
				<path d={FILE_PATH} />
				<path d={FILE_FOLD} />
			</g>
			{id === "file-plus-one" ? (
				<text
					x="17.6"
					y="17.6"
					textAnchor="middle"
					fontSize="8.5"
					fontWeight="700"
					className="agent-client-floating-note-context-mark"
				>
					+1
				</text>
			) : (
				<g transform="translate(13.2,8.4) scale(0.42)">
					<path d={INFINITY_PATH} />
				</g>
			)}
		</svg>
	);
}

export function FloatingNoteContextButton({
	iconId,
	mode,
	tooltip,
	onClick,
}: {
	iconId: FloatingNoteContextIconId;
	mode: string;
	tooltip: string;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={`clickable-icon agent-client-header-button agent-client-floating-note-context-cycle is-${mode}`}
			title={tooltip}
			aria-label={tooltip}
			onClick={onClick}
		>
			<FloatingNoteContextGlyph id={iconId} />
		</button>
	);
}
