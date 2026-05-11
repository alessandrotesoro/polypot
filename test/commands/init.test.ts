import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "@oclif/test";
import { expect } from "chai";

describe("polypot init", () => {
	it("lists --force, --cwd, --[no-]gitignore, --yes in --help", async () => {
		const { stdout } = await runCommand(["init", "--help"]);
		expect(stdout).to.include("--force");
		expect(stdout).to.include("--cwd");
		expect(stdout).to.include("--[no-]gitignore");
		expect(stdout).to.include("--yes");
		expect(stdout).to.not.include("--no-config");
	});

	it("--no-gitignore suppresses the gitignore-append line", async () => {
		const { stdout, error } = await runCommand([
			"init",
			"--no-gitignore",
			"--yes",
		]);
		expect(error).to.equal(undefined);
		expect(stdout).to.not.include(".gitignore");
	});

	it("--cwd echoes the custom path in the stub output", async () => {
		const customCwd = "/tmp/polypot-init-test-cwd";
		const { stdout, error } = await runCommand([
			"init",
			"--cwd",
			customCwd,
		]);
		expect(error).to.equal(undefined);
		expect(stdout).to.include(customCwd);
	});

	it("does not create or modify any file", async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "polypot-init-"));
		const gitignorePath = path.join(tempDir, ".gitignore");
		const originalGitignore = "# existing rules\nnode_modules/\n";
		fs.writeFileSync(gitignorePath, originalGitignore);
		try {
			const { error } = await runCommand(["init", "--cwd", tempDir]);
			expect(error).to.equal(undefined);
			expect(fs.existsSync(path.join(tempDir, ".polypot"))).to.equal(
				false,
			);
			expect(fs.readFileSync(gitignorePath, "utf8")).to.equal(
				originalGitignore,
			);
		} finally {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
