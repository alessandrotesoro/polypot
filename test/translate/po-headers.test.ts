import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect } from "chai";
import {
	buildPoHeaders,
	loadPoHeaderTemplate,
} from "../../src/translate/po-headers.js";

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

	it("allows templates to set non-dynamic headers only", () => {
		const headers = buildPoHeaders({
			baseHeaders: {
				"X-Generator": "base",
			},
			date: new Date("2026-05-22T03:04:00.000Z"),
			targetLanguage: "ja",
			templateHeaders: {
				Language: "wrong",
				"Plural-Forms": "wrong",
				"X-Generator": "template",
			},
		});

		expect(headers).to.deep.include({
			Language: "ja",
			"Plural-Forms": "nplurals=1; plural=0;",
			"X-Generator": "template",
		});
	});

	it("loads string-valued JSON header templates", async () => {
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-headers-"),
		);
		const templatePath = path.join(directory, "headers.json");

		try {
			await fs.writeFile(
				templatePath,
				JSON.stringify({ "X-Generator": "Polypot" }),
			);

			const result = await loadPoHeaderTemplate(templatePath);

			expect(result.warning).to.equal(undefined);
			expect(result.headers).to.deep.equal({ "X-Generator": "Polypot" });
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});

	it("returns a warning for malformed templates", async () => {
		const directory = await fs.mkdtemp(
			path.join(os.tmpdir(), "polypot-headers-bad-"),
		);
		const templatePath = path.join(directory, "headers.json");

		try {
			await fs.writeFile(templatePath, "[1, 2]");

			const result = await loadPoHeaderTemplate(templatePath);

			expect(result.headers).to.deep.equal({});
			expect(result.warning).to.include("must be a JSON object");
		} finally {
			await fs.rm(directory, { recursive: true, force: true });
		}
	});
});
