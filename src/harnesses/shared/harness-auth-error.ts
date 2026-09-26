/** Thrown when session/new needs ACP authenticate but UI must run it (no silent retry). */
export class HarnessAuthRequiredError extends Error {
	readonly methodId: string;

	constructor(methodId: string, message = "Authentication required") {
		super(message);
		this.name = "HarnessAuthRequiredError";
		this.methodId = methodId;
	}

	static isInstance(error: unknown): error is HarnessAuthRequiredError {
		return error instanceof HarnessAuthRequiredError;
	}
}
