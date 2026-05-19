import fs from "node:fs/promises";
import path from "node:path";
import { readOptionalUtf8File } from "../files.js";

const PROJECT_ENV_IGNORE_ENTRY = ".polypot/.env";
const PROJECT_ENV_UNIGNORE_ENTRY = `!${PROJECT_ENV_IGNORE_ENTRY}`;

/**
 * Ensure the project secret file is ignored.
 *
 * @param cwd Project directory.
 */
export async function ensureProjectEnvGitignore(cwd: string): Promise<void> {
	const gitignorePath = path.join(cwd, ".gitignore");
	const existing = await readOptionalUtf8File(gitignorePath);
	const lines = existing?.split(/\r?\n/) ?? [];
	const lastRelevantEntry = lines
		.map((line) => line.trim())
		.filter(
			(line) =>
				line === PROJECT_ENV_IGNORE_ENTRY ||
				line === PROJECT_ENV_UNIGNORE_ENTRY,
		)
		.at(-1);

	if (lastRelevantEntry === PROJECT_ENV_IGNORE_ENTRY) return;

	const prefix =
		existing === undefined || existing.length === 0
			? ""
			: existing.endsWith("\n")
				? existing
				: `${existing}\n`;
	await fs.writeFile(
		gitignorePath,
		`${prefix}${PROJECT_ENV_IGNORE_ENTRY}\n`,
	);
}
