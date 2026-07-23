/**
 * Minimal ANSI stripper — covers CSI / OSC / single-char escapes / bare ESC
 * plus loose carriage-return normalization. Not a full terminal emulator,
 * just enough to recognize plain-text patterns inside a noisy PTY stream
 * (e.g. the trust-prompt banner during boot).
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences IS the job here
const CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences IS the job here
const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences IS the job here
const SINGLE_CHAR_ESC_RE = /\x1b[@-Z\\-_]/g
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching terminal escape sequences IS the job here
const BARE_ESC_RE = /\x1b/g
const CARRIAGE_RETURN_RE = /\r(?!\n)/g

export function stripAnsi(input: string): string {
	return input
		.replace(OSC_RE, '')
		.replace(CSI_RE, '')
		.replace(SINGLE_CHAR_ESC_RE, '')
		.replace(BARE_ESC_RE, '')
		.replace(CARRIAGE_RETURN_RE, '\n')
}

/**
 * `claude` shows a workspace-trust banner on first spawn per cwd. A headless
 * runner can't show a dialog, so we sniff for it in the raw boot output and
 * auto-accept by pressing Enter (which confirms the highlighted default
 * option, "Yes, I trust this folder").
 *
 * D2 spike gotcha (fork-d2-spike.md): the claude TUI paints spacing via
 * cursor-motion escapes, so after ANSI-stripping words CONCATENATE
 * ("trustthisfolder"). We therefore squash ALL whitespace out of the window
 * before matching, and the patterns below are written against the squashed
 * text — never space-containing literals. Banner wording has evolved across
 * releases; we match both the modern 2.x text ("Quick safety check" /
 * "Is this a project you created or one you trust?" / "Yes, I trust this
 * folder") and the legacy 1.x text ("Do you trust the files in this
 * folder?") so the runner survives upgrades.
 */
const TRUST_PROMPT_PATTERNS_SQUASHED = [
	/Isthisaprojectyoucreatedoroneyoutrust\?/i,
	/Yes,Itrustthisfolder/i,
	/Quicksafetycheck/i,
	/Doyoutrustthefilesinthisfolder\?/i,
	/trustthe(files|workspace)/i,
]

export function squashWhitespace(input: string): string {
	return input.replace(/\s+/g, '')
}

export function shouldAutoAcceptTrustPrompt(plainOutput: string): boolean {
	const squashed = squashWhitespace(plainOutput)
	return TRUST_PROMPT_PATTERNS_SQUASHED.some(p => p.test(squashed))
}

/**
 * Main-TUI readiness markers (whitespace-squashed, same D2 rationale as the trust patterns).
 * `ClaudeBootSequence` waits for one of these before the runner writes the priming prompt —
 * pasting into a still-initializing REPL is what loses turns. Wording drifts across releases,
 * so boot falls back to the time-based settle when none matches.
 */
const MAIN_UI_PATTERNS_SQUASHED = [/forshortcuts/i, /esctointerrupt/i, /bypasspermissions/i, /ctrl\+gtoeditinVim/i, /Try"/i]

export function isMainUiReady(plainOutput: string): boolean {
	const squashed = squashWhitespace(plainOutput)
	return MAIN_UI_PATTERNS_SQUASHED.some(p => p.test(squashed))
}
