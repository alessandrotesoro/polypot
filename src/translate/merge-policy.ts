import { isMissingFileError } from "../files.js";
import type { ExistingPoMergeResult } from "./po-writer.js";
import { readPoFile } from "./po-writer.js";

export type ExistingPoMergeSource =
	| { readonly kind: "none" }
	| { readonly kind: "defaultOutput"; readonly path: string }
	| { readonly kind: "explicitInput"; readonly path: string };

export interface MergeSourcePlan {
	readonly language: string;
	readonly source: ExistingPoMergeSource;
}

export type MergeSourcePlanningResult =
	| { readonly ok: true; readonly sources: readonly MergeSourcePlan[] }
	| { readonly error: string; readonly ok: false };

export function planExistingPoMergeSources(options: {
	readonly forceTranslate: boolean;
	readonly inputPoPath?: string;
	readonly outputFiles: ReadonlyMap<string, string>;
	readonly targetLanguages: readonly string[];
}): MergeSourcePlanningResult {
	if (options.forceTranslate) {
		return {
			ok: true,
			sources: options.targetLanguages.map((language) => ({
				language,
				source: { kind: "none" },
			})),
		};
	}

	if (
		options.inputPoPath !== undefined &&
		options.targetLanguages.length > 1
	) {
		return {
			error: "A single input PO path cannot be merged into multiple target languages. Run one target language at a time or omit inputPoPath.",
			ok: false,
		};
	}

	return {
		ok: true,
		sources: options.targetLanguages.map((language) => ({
			language,
			source:
				options.inputPoPath === undefined
					? {
							kind: "defaultOutput",
							path: options.outputFiles.get(language) ?? "",
						}
					: { kind: "explicitInput", path: options.inputPoPath },
		})),
	};
}

export async function readExistingPoMergeSource(
	source: ExistingPoMergeSource,
): Promise<
	| {
			readonly data: ExistingPoMergeResult["output"];
	  }
	| undefined
> {
	if (source.kind === "none") return undefined;

	try {
		return { data: await readPoFile(source.path) };
	} catch (error) {
		if (source.kind === "defaultOutput" && isMissingFileError(error)) {
			return undefined;
		}

		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Could not read ${source.kind === "explicitInput" ? "input" : "existing output"} PO file at ${source.path}: ${message}`,
		);
	}
}
