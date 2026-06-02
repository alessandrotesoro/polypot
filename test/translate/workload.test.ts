import { expect } from "chai";
import { knownTranslationEstimate } from "../../src/translate/cost.js";
import type { PotAnalysis } from "../../src/translate/pot.js";
import { buildTranslateWorkload } from "../../src/translate/workload.js";

function buildAnalysis(characters: readonly number[]): PotAnalysis {
	return {
		contextStrings: 0,
		filePath: "messages.pot",
		fuzzyStrings: 0,
		pluralStrings: 0,
		sourceCharacters: characters.reduce((total, count) => total + count, 0),
		strings: characters.map((count, index) => ({
			characters: count,
			flags: [],
			id: `String ${index + 1}`,
			plural: false,
		})),
		totalStrings: characters.length,
	};
}

describe("buildTranslateWorkload", () => {
	it("applies per-language string limits", () => {
		const workload = buildTranslateWorkload(
			{
				batchSize: 2,
				languages: ["fr_FR", "es_ES"],
				localeFormat: "target_lang",
				maxStringsPerJob: 2,
				outputDir: "languages",
			},
			buildAnalysis([10, 10, 10, 10]),
		);

		expect(workload.languages).to.deep.include({
			batches: 1,
			estimate: workload.languages[0]?.estimate,
			language: "fr_FR",
			outputFile: "languages/fr_FR.po",
			plannedStrings: 2,
			skippedByCost: 0,
			skippedByLimit: 2,
			sourceStrings: 4,
		});
		expect(workload.plannedStrings).to.equal(4);
		expect(workload.skippedByLimit).to.equal(4);
	});

	it("applies the global string limit across languages", () => {
		const workload = buildTranslateWorkload(
			{
				batchSize: 20,
				languages: ["fr_FR", "es_ES"],
				localeFormat: "target_lang",
				maxTotalStrings: 5,
				outputDir: "languages",
			},
			buildAnalysis([10, 10, 10, 10]),
		);

		expect(
			workload.languages.map((language) => language.plannedStrings),
		).to.deep.equal([4, 1]);
		expect(
			workload.languages.map((language) => language.skippedByLimit),
		).to.deep.equal([0, 3]);
	});

	it("applies the cost limit across languages", () => {
		const workload = buildTranslateWorkload(
			{
				batchSize: 20,
				estimateCost: (sourceCharacters) =>
					knownTranslationEstimate({
						cost: sourceCharacters / 1_000_000,
						inputTokens: sourceCharacters,
						outputTokens: 0,
					}),
				languages: ["fr_FR", "es_ES"],
				localeFormat: "target_lang",
				maxCost: 0.0012,
				outputDir: "languages",
			},
			buildAnalysis([1000, 1000, 1000, 1000]),
		);

		expect(
			workload.languages.map((language) => language.plannedStrings),
		).to.deep.equal([1, 0]);
		expect(
			workload.languages.map((language) => language.skippedByCost),
		).to.deep.equal([3, 4]);
	});

	it("formats output filenames with the requested locale format", () => {
		const analysis = buildAnalysis([10]);
		const baseOptions = {
			batchSize: 20,
			languages: ["fr_FR"],
			outputDir: "languages",
		};

		expect(
			buildTranslateWorkload(
				{ ...baseOptions, localeFormat: "target_lang" },
				analysis,
			).languages[0]?.outputFile,
		).to.equal("languages/fr_FR.po");
		expect(
			buildTranslateWorkload(
				{ ...baseOptions, localeFormat: "iso_639_1" },
				analysis,
			).languages[0]?.outputFile,
		).to.equal("languages/fr.po");
		expect(
			buildTranslateWorkload(
				{ ...baseOptions, localeFormat: "iso_639_2" },
				analysis,
			).languages[0]?.outputFile,
		).to.equal("languages/fra.po");
	});
});
