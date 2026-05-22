import { expect } from "chai";
import {
	buildTranslationBatchPlan,
	type TranslationBatch,
} from "../../src/translate/batches.js";
import type { PotEntry } from "../../src/translate/pot.js";

function entry(
	msgid: string,
	options: {
		readonly msgstr?: readonly string[];
		readonly plural?: boolean;
	} = {},
): PotEntry {
	return {
		characters: msgid.length,
		context: "",
		flags: [],
		key: `\u0004${msgid}`,
		msgid,
		msgstr: options.msgstr ?? [""],
		obsolete: false,
		plural: options.plural ?? false,
		references: [],
	};
}

function batchIds(batch: TranslationBatch): readonly string[] {
	return batch.entries.map((item) => item.msgid);
}

describe("buildTranslationBatchPlan", () => {
	it("splits untranslated entries into ordered batches", () => {
		const plan = buildTranslationBatchPlan(
			[
				entry("One"),
				entry("Two"),
				entry("Three"),
				entry("Four"),
				entry("Five"),
			],
			{ batchSize: 2 },
		);

		expect(plan.plannedStrings).to.equal(5);
		expect(plan.skippedByExisting).to.equal(0);
		expect(plan.skippedByLimit).to.equal(0);
		expect(plan.batches.map(batchIds)).to.deep.equal([
			["One", "Two"],
			["Three", "Four"],
			["Five"],
		]);
	});

	it("skips already translated entries unless force translate is enabled", () => {
		const entries = [
			entry("One"),
			entry("Two", { msgstr: ["Deux"] }),
			entry("Three"),
		];
		const incrementalPlan = buildTranslationBatchPlan(entries, {
			batchSize: 20,
		});
		const forcedPlan = buildTranslationBatchPlan(entries, {
			batchSize: 20,
			forceTranslate: true,
		});

		expect(incrementalPlan.plannedStrings).to.equal(2);
		expect(incrementalPlan.skippedByExisting).to.equal(1);
		expect(
			incrementalPlan.batches[0]?.entries.map((item) => item.msgid),
		).to.deep.equal(["One", "Three"]);
		expect(forcedPlan.plannedStrings).to.equal(3);
		expect(forcedPlan.skippedByExisting).to.equal(0);
	});

	it("applies string limits after existing translations are skipped", () => {
		const plan = buildTranslationBatchPlan(
			[
				entry("One"),
				entry("Two", { msgstr: ["Deux"] }),
				entry("Three"),
				entry("Four"),
			],
			{ batchSize: 20, maxStrings: 1 },
		);

		expect(plan.plannedStrings).to.equal(1);
		expect(plan.skippedByExisting).to.equal(1);
		expect(plan.skippedByLimit).to.equal(2);
		expect(plan.batches[0]?.entries[0]?.msgid).to.equal("One");
	});

	it("returns no batches when no strings need translation", () => {
		const plan = buildTranslationBatchPlan(
			[
				entry("One", { msgstr: ["Un"] }),
				entry("Two", { msgstr: ["Deux"] }),
			],
			{ batchSize: 20 },
		);

		expect(plan.plannedStrings).to.equal(0);
		expect(plan.skippedByExisting).to.equal(2);
		expect(plan.batches).to.deep.equal([]);
	});
});
