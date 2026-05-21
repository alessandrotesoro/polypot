const BELL = String.fromCharCode(7);
const ESCAPE = String.fromCharCode(27);
const ANSI_ESCAPE_PATTERN = new RegExp(
	`${ESCAPE}(?:\\][^${BELL}]*(?:${BELL}|${ESCAPE}\\\\)|\\[[0-?]*[ -/]*[@-~]|[@-Z\\\\-_])`,
	"g",
);

function sanitizeControlCharacters(value: string): string {
	return Array.from(value, (character) => {
		const code = character.charCodeAt(0);
		return code < 32 || code === 127 ? "?" : character;
	}).join("");
}

export function sanitizeTerminalText(value: string): string {
	return sanitizeControlCharacters(value.replace(ANSI_ESCAPE_PATTERN, ""));
}
