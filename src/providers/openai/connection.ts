import {
	APIConnectionError,
	APIConnectionTimeoutError,
	APIError,
	OpenAI,
} from "openai";

export type OpenAIConnectionResult =
	| { readonly ok: true }
	| {
			readonly ok: false;
			readonly reason:
				| "missing-key"
				| "auth-failed"
				| "network-error"
				| "unknown-error";
			readonly message: string;
	  };

export interface OpenAIModelsClient {
	readonly models: {
		list(): Promise<unknown>;
	};
}

export type OpenAIClientFactory = (apiKey: string) => OpenAIModelsClient;

export const SETUP_OPENAI_VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Create an OpenAI client for setup validation.
 *
 * @param apiKey OpenAI API key.
 * @returns OpenAI client wrapper used by validation.
 */
const defaultClientFactory: OpenAIClientFactory = (apiKey) =>
	new OpenAI({
		apiKey,
		maxRetries: 0,
		timeout: SETUP_OPENAI_VALIDATION_TIMEOUT_MS,
	});

/**
 * Convert OpenAI errors into setup validation results.
 *
 * @param error Error to inspect.
 * @returns A validation result for the error.
 */
function classifyOpenAIError(error: unknown): OpenAIConnectionResult {
	if (
		error instanceof APIError &&
		(error.status === 401 || error.status === 403)
	) {
		return {
			ok: false,
			reason: "auth-failed",
			message: "OpenAI rejected the API key.",
		};
	}

	if (
		error instanceof APIConnectionError ||
		error instanceof APIConnectionTimeoutError
	) {
		return {
			ok: false,
			reason: "network-error",
			message: "Could not reach OpenAI to validate the API key.",
		};
	}

	return {
		ok: false,
		reason: "unknown-error",
		message: "Could not validate the OpenAI API key.",
	};
}

/**
 * Check an OpenAI key by listing models.
 *
 * @param apiKey OpenAI API key.
 * @param createClient Factory used to create the OpenAI client.
 * @returns Validation result for the API key.
 */
export async function validateOpenAIConnection(
	apiKey: string,
	createClient: OpenAIClientFactory = defaultClientFactory,
): Promise<OpenAIConnectionResult> {
	const normalized = apiKey.trim();
	if (normalized.length === 0) {
		return {
			ok: false,
			reason: "missing-key",
			message: "OpenAI API key is required to validate the connection.",
		};
	}

	try {
		await createClient(normalized).models.list();
		return { ok: true };
	} catch (error) {
		return classifyOpenAIError(error);
	}
}
