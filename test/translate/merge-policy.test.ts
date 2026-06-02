import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	planExistingPoMergeSources,
	readExistingPoMergeSource,
} from "../../src/translate/merge-policy.js";

describe("existing PO merge policy", () => {
	let directory: string;

	beforeEach(async () => {
		directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-merge-policy-"),
		);
	});

	afterEach(async () => {
		await fs.rm(directory, { recursive: true, force: true });
	});

	function outputFiles(): ReadonlyMap<string, string> {
		return new Map([
			["fr_FR", path.join(directory, "fr_FR.po")],
			["es_ES", path.join(directory, "es_ES.po")],
		]);
	}

	it("does not plan merge sources when force translate is enabled", () => {
		const plan = planExistingPoMergeSources({
			forceTranslate: true,
			outputFiles: outputFiles(),
			targetLanguages: ["fr_FR", "es_ES"],
		});

		expect(plan).to.deep.equal({
			ok: true,
			sources: [
				{ language: "fr_FR", source: { kind: "none" } },
				{ language: "es_ES", source: { kind: "none" } },
			],
		});
	});

	it("rejects one explicit input PO for multiple target languages", () => {
		const plan = planExistingPoMergeSources({
			inputPoPath: path.join(directory, "input.po"),
			forceTranslate: false,
			outputFiles: outputFiles(),
			targetLanguages: ["fr_FR", "es_ES"],
		});

		expect(plan.ok).to.equal(false);
		expect(plan.ok ? "" : plan.error).to.include(
			"cannot be merged into multiple target languages",
		);
	});

	it("plans default output merge sources per language", () => {
		const plan = planExistingPoMergeSources({
			forceTranslate: false,
			outputFiles: outputFiles(),
			targetLanguages: ["fr_FR"],
		});

		expect(plan).to.deep.equal({
			ok: true,
			sources: [
				{
					language: "fr_FR",
					source: {
						kind: "defaultOutput",
						path: path.join(directory, "fr_FR.po"),
					},
				},
			],
		});
	});

	it("treats a missing default output PO as no merge source", async () => {
		const result = await readExistingPoMergeSource({
			kind: "defaultOutput",
			path: path.join(directory, "missing.po"),
		});

		expect(result).to.equal(undefined);
	});

	it("surfaces explicit input PO read failures with source context", async () => {
		try {
			await readExistingPoMergeSource({
				kind: "explicitInput",
				path: path.join(directory, "missing.po"),
			});
			expect.fail("expected explicit input read to fail");
		} catch (error) {
			expect(error).to.be.instanceOf(Error);
			expect((error as Error).message).to.include("input PO file");
		}
	});
});
