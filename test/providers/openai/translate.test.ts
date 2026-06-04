import { expect } from "chai";
import { APIError } from "openai";
import type {
	OpenAIChatCompletionResponse,
	OpenAITranslationClient,
} from "../../../src/providers/openai/translate.js";
import { translateOpenAIBatch } from "../../../src/providers/openai/translate.js";
import type { PotEntry } from "../../../src/translate/pot.js";

function entry(msgid: string): PotEntry {
	return {
		characters: msgid.length,
		context: "",
		flags: [],
		key: `\u0004${msgid}`,
		msgid,
		msgstr: [""],
		obsolete: false,
		plural: false,
		references: [],
	};
}

function buildOptions(
	overrides: Partial<Parameters<typeof translateOpenAIBatch>[0]> = {},
): Parameters<typeof translateOpenAIBatch>[0] {
	return {
		apiKey: "sk-test",
		dryRun: false,
		entries: [entry("Hello")],
		maxRetries: 0,
		model: "gpt-5.4-mini",
		pluralCount: 2,
		promptTemplate: "Translate {{SOURCE_LANGUAGE}} to {{TARGET_LANGUAGE}}.",
		retryDelayMs: 0,
		sourceLanguage: "en_US",
		targetLanguage: "fr_FR",
		temperature: 0.1,
		timeoutSeconds: 60,
		...overrides,
	};
}

function clientFactory(options: {
	readonly calls: unknown[];
	readonly fail?: () => Error | undefined;
	readonly response?: OpenAIChatCompletionResponse;
}): () => OpenAITranslationClient {
	return () => ({
		chat: {
			completions: {
				create: async (body) => {
					options.calls.push(body);
					const failure = options.fail?.();
					if (failure !== undefined) throw failure;

					return (
						options.response ?? {
							choices: [
								{
									message: {
										content: '<t i="1">Bonjour</t>',
									},
								},
							],
							usage: {
								completion_tokens: 5,
								prompt_tokens: 10,
								total_tokens: 15,
							},
						}
					);
				},
			},
		},
	});
}

describe("translateOpenAIBatch", () => {
	it("translates a batch with an injected client", async () => {
		const calls: unknown[] = [];
		const result = await translateOpenAIBatch(
			buildOptions({ maxTokens: 500 }),
			clientFactory({ calls }),
		);

		expect(result.ok).to.equal(true);
		if (!result.ok) throw new Error(result.error);
		expect(result.translations[0]?.msgstr).to.deep.equal(["Bonjour"]);
		expect(calls[0] as Record<string, unknown>).to.deep.include({
			max_tokens: 500,
			model: "gpt-5.4-mini",
			temperature: 0.1,
		});
	});

	it("does not create a request during dry-run", async () => {
		const calls: unknown[] = [];
		const result = await translateOpenAIBatch(
			buildOptions({ dryRun: true }),
			clientFactory({ calls }),
		);

		expect(result.ok).to.equal(true);
		if (!result.ok) throw new Error(result.error);
		expect(calls).to.deep.equal([]);
		expect(result.dryRun).to.equal(true);
		expect(result.missingEntries.map((item) => item.msgid)).to.deep.equal([
			"Hello",
		]);
	});

	it("blocks non-dry-run translation when the API key is missing", async () => {
		const { apiKey: _apiKey, ...options } = buildOptions();
		const result = await translateOpenAIBatch(
			options,
			clientFactory({ calls: [] }),
		);

		expect(result).to.deep.include({
			error: "OpenAI API key is required for translation.",
			ok: false,
			retryable: false,
		});
	});

	it("retries transient failures", async () => {
		const calls: unknown[] = [];
		let attempts = 0;
		const result = await translateOpenAIBatch(
			buildOptions({ maxRetries: 1 }),
			clientFactory({
				calls,
				fail: () => {
					attempts += 1;
					return attempts === 1
						? new Error("temporary failure")
						: undefined;
				},
			}),
		);

		expect(result.ok).to.equal(true);
		expect(calls).to.have.length(2);
	});

	it("does not retry authentication failures", async () => {
		const calls: unknown[] = [];
		const result = await translateOpenAIBatch(
			buildOptions({ maxRetries: 3 }),
			clientFactory({
				calls,
				fail: () =>
					new APIError(
						401,
						{ message: "bad key" },
						"bad key",
						new Headers(),
					),
			}),
		);

		expect(result.ok).to.equal(false);
		expect(calls).to.have.length(1);
	});

	it("retries malformed model responses before failing with debug context", async () => {
		const calls: unknown[] = [];
		const result = await translateOpenAIBatch(
			buildOptions({ maxRetries: 1 }),
			clientFactory({
				calls,
				response: {
					choices: [{ message: { content: '<t i="1"></t>' } }],
				},
			}),
		);

		expect(result.ok).to.equal(false);
		expect(calls).to.have.length(2);
		if (result.ok) throw new Error("expected failure");
		expect(result.error).to.include("translation contract");
		expect(result.debug?.response).to.equal('<t i="1"></t>');
	});

	it("returns partial valid translations instead of discarding a mixed response", async () => {
		const calls: unknown[] = [];
		const result = await translateOpenAIBatch(
			buildOptions({
				entries: [entry("Hello"), entry("Save")],
			}),
			clientFactory({
				calls,
				response: {
					choices: [
						{
							message: {
								content: '<t i="1">Bonjour</t>',
							},
						},
					],
					usage: {
						completion_tokens: 5,
						prompt_tokens: 10,
						total_tokens: 15,
					},
				},
			}),
		);

		expect(result.ok).to.equal(true);
		if (!result.ok) throw new Error(result.error);
		expect(result.translations[0]?.msgstr).to.deep.equal(["Bonjour"]);
		expect(result.missingEntries.map((item) => item.msgid)).to.deep.equal([
			"Save",
		]);
		expect(calls).to.have.length(1);
	});

	it("returns valid translations when another item is rejected by validation", async () => {
		const result = await translateOpenAIBatch(
			buildOptions({
				entries: [entry("Hello %s"), entry("Save")],
			}),
			clientFactory({
				calls: [],
				response: {
					choices: [
						{
							message: {
								content:
									'<t i="1">Bonjour</t><t i="2">Enregistrer</t>',
							},
						},
					],
					usage: {
						completion_tokens: 5,
						prompt_tokens: 10,
						total_tokens: 15,
					},
				},
			}),
		);

		expect(result.ok).to.equal(true);
		if (!result.ok) throw new Error(result.error);
		expect(result.translations).to.have.length(2);
		expect(result.translations[0]?.msgstr).to.deep.equal([""]);
		expect(result.translations[1]?.msgstr).to.deep.equal(["Enregistrer"]);
		expect(result.validationStats.placeholderMismatches).to.equal(1);
	});

	it("reports malformed responses with debug context", async () => {
		const result = await translateOpenAIBatch(
			buildOptions({ maxRetries: 0 }),
			clientFactory({
				calls: [],
				response: {
					choices: [{ message: { content: '<t i="1"></t>' } }],
					usage: {
						completion_tokens: 5,
						prompt_tokens: 10,
						total_tokens: 15,
					},
				},
			}),
		);

		expect(result.ok).to.equal(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.debug?.response).to.equal('<t i="1"></t>');
	});

	it("retries semantic failures before a later successful response", async () => {
		const calls: unknown[] = [];
		const responses: OpenAIChatCompletionResponse[] = [
			{
				choices: [{ message: { content: '<t i="1"></t>' } }],
				usage: {
					completion_tokens: 5,
					prompt_tokens: 10,
					total_tokens: 15,
				},
			},
			{
				choices: [{ message: { content: '<t i="1">Bonjour</t>' } }],
				usage: {
					completion_tokens: 10,
					prompt_tokens: 20,
					total_tokens: 30,
				},
			},
		];
		const result = await translateOpenAIBatch(
			buildOptions({ maxRetries: 1 }),
			() => ({
				chat: {
					completions: {
						create: async (body) => {
							calls.push(body);
							const response = responses.shift();
							if (response === undefined) {
								throw new Error("unexpected extra request");
							}

							return response;
						},
					},
				},
			}),
		);

		expect(result.ok).to.equal(true);
		if (!result.ok) throw new Error(result.error);
		expect(calls).to.have.length(2);
		expect(result.translations[0]?.msgstr).to.deep.equal(["Bonjour"]);
	});

	it("redacts API keys from provider error messages", async () => {
		const calls: unknown[] = [];
		const result = await translateOpenAIBatch(
			buildOptions({ apiKey: "sk-secret" }),
			clientFactory({
				calls,
				fail: () => new Error("request failed for sk-secret"),
			}),
		);

		expect(result.ok).to.equal(false);
		if (result.ok) throw new Error("expected failure");
		expect(result.error).to.not.include("sk-secret");
		expect(result.error).to.include("[redacted]");
	});
});
