import { expect } from "chai";
import { buildPoHeaders } from "../../src/translate/po-headers.js";

describe("PO headers", () => {
	it("builds target-specific dynamic headers", () => {
		const headers = buildPoHeaders({
			baseHeaders: {
				"Content-Type": "text/plain; charset=UTF-8",
				Language: "en-US",
				"Plural-Forms": "nplurals=2; plural=(n != 1);",
				"Project-Id-Version": "My plugin {{LANGUAGE}}",
			},
			date: new Date("2026-05-22T03:04:00.000Z"),
			targetLanguage: "fr_FR",
		});

		expect(headers).to.deep.include({
			"Content-Type": "text/plain; charset=UTF-8",
			Language: "fr-FR",
			"PO-Revision-Date": "2026-05-22 03:04+0000",
			"Project-Id-Version": "My plugin fr_FR",
			"Plural-Forms": "nplurals=2; plural=(n > 1);",
		});
	});

	it("overwrites dynamic source headers only", () => {
		const headers = buildPoHeaders({
			baseHeaders: {
				Language: "wrong",
				"Plural-Forms": "wrong",
				"X-Generator": "base",
			},
			date: new Date("2026-05-22T03:04:00.000Z"),
			targetLanguage: "ja",
		});

		expect(headers).to.deep.include({
			Language: "ja-JP",
			"Plural-Forms": "nplurals=1; plural=0;",
			"X-Generator": "base",
		});
	});
});
