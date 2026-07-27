import { AgentModelId, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import type { AgentMcpInvocation } from '../../types/AgentMcpInvocation'
import type { ProviderDef, ProviderBuildArgsOptions } from '../ProviderDef'

/**
 * `claude` — the reference provider, driven in BIDIRECTIONAL HEADLESS STREAM-JSON over plain pipes.
 * No PTY, no Agent SDK, no HTTP to Anthropic from our side.
 *
 * The canonical invocation this def encodes verbatim
 * (`.specs/codedm/2026-07-26-agent-driving-stream-json.md`):
 *
 *   claude -p --input-format stream-json --output-format stream-json --verbose \
 *          [--include-partial-messages] [--model X] [--add-dir …] \
 *          [--session-id <uuid> | --resume <id>] \
 *          --permission-mode bypassPermissions
 *
 * Three of those flags each delete a whole class of code that used to exist here:
 *  - `--output-format stream-json` deletes the TUI marker parser AND the per-session transcript-file
 *    reader (the CLI's own on-disk project transcripts — the path literal is deliberately NOT written
 *    anywhere in this file; `tests/architecture/pty-isolation.test.ts` confines it to the legacy
 *    engine subtree, and a mere mention here would be a violation of that rail). The reply is
 *    reconstructed exclusively from parsed stdout frames; mining raw stdout instead yields empty
 *    extractions, which is the bug that parked the old engine.
 *  - `--permission-mode bypassPermissions` deletes the trust-prompt keystroke injection. Headless
 *    `-p` with no TTY never shows a prompt, so there is nothing to auto-accept.
 *  - `--session-id` / `--resume` delete transcript re-sending. Multi-turn context is the CLI's own
 *    session; re-rendering the transcript into the prompt is only the fallback for providers without it.
 */

/**
 * `AgentModelId` → the CLI's own model alias. A MAP, not a `switch`, and it lives in the def because
 * "what this binary calls its models" is exactly the kind of per-CLI difference §4.7 says must be
 * data. `DEFAULT` is absent on purpose: it is the instruction to omit `--model` altogether, which is
 * why it is a member of the enum rather than `undefined`.
 */
const CLAUDE_MODEL_ALIASES: Partial<Record<AgentModelId, string>> = {
	[AgentModelId.SONNET]: 'sonnet',
	[AgentModelId.OPUS]: 'opus',
	[AgentModelId.HAIKU]: 'haiku',
}

/** The server key our tools are namespaced under inside the CLI's MCP config. */
const MCP_SERVER_KEY = 'codedm'

/**
 * Serialize an `AgentMcpInvocation` into the `--mcp-config` payload. The run token rides in the
 * `Authorization` header (http) or in the child `env` (stdio) — never in a tool argument, never in
 * the prompt. Both shapes are what the CLI's `mcpServers` map expects.
 */
function renderMcpConfig(mcp: AgentMcpInvocation): string {
	const server =
		mcp.transport === 'http'
			? { type: 'http', url: mcp.endpoint, headers: { Authorization: `Bearer ${mcp.token}` } }
			: { type: 'stdio', command: mcp.command?.command, args: mcp.command?.args ?? [], env: { CODEDM_RUN_TOKEN: mcp.token } }
	return JSON.stringify({ mcpServers: { [MCP_SERVER_KEY]: server } })
}

export const claudeProviderDef: ProviderDef = {
	id: ProviderKind.CLAUDE_CODE,
	bin: 'claude',
	versionArgs: ['--version'],
	helpArgs: ['--help'],
	capabilityFlags: {
		'--include-partial-messages': 'partialMessages',
		'--mcp-config': 'mcpConfig',
		'--resume': 'sessionResume',
	},
	promptViaStdin: true,
	promptInputFormat: 'stream-json',
	streamFormat: 'claude-stream-json',
	resumesSessionViaCli: true,
	capturesSessionIdFromStream: true,
	mcpConfigFlag: '--mcp-config',
	mcpConfigFormat: 'json-inline',
	allowedToolsFlag: '--allowedTools',
	disallowedToolsFlag: '--disallowedTools',

	buildArgs({ model, extraDirs, resumeSessionId, newSessionId, mcp, caps }: ProviderBuildArgsOptions): string[] {
		const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose']

		// Capability-gated, NOT version-gated: an older build without the flag would abort on an
		// unknown argument, and a newer one gets token-level deltas the moment the probe sees it.
		if (caps.partialMessages) args.push('--include-partial-messages')

		// DEFAULT ⇒ omit the flag entirely so the CLI chooses. An unmapped member (a value added
		// to the wire enum without a CLI alias) also omits rather than passing a bogus string.
		const modelAlias = model && model !== AgentModelId.DEFAULT ? CLAUDE_MODEL_ALIASES[model] : undefined
		if (modelAlias) args.push('--model', modelAlias)

		for (const dir of extraDirs ?? []) args.push('--add-dir', dir)

		// MUTUALLY EXCLUSIVE by construction, not by caller discipline: resuming an existing session
		// and pinning the id of a new one are contradictory instructions, and passing both makes the
		// CLI's behaviour version-dependent. Resume wins — it is the strictly more informed intent.
		if (resumeSessionId) args.push('--resume', resumeSessionId)
		else if (newSessionId) args.push('--session-id', newSessionId)

		// The two conditions are ANDed on purpose: `mcp` present says the AGENT asked for tools, the
		// flags being declared says this BINARY can receive them. Neither alone is sufficient, and
		// neither is a `provider === …` test.
		if (mcp && claudeProviderDef.mcpConfigFlag && claudeProviderDef.allowedToolsFlag) {
			args.push(claudeProviderDef.mcpConfigFlag, renderMcpConfig(mcp))
			args.push(claudeProviderDef.allowedToolsFlag, mcp.allowedTools.join(','))
		}

		// Last, and unconditional: headless `-p` has no TTY to render a permission prompt on, so the
		// authority is delegated wholesale once, here, at spawn. That is a deliberate authority trade.
		args.push('--permission-mode', 'bypassPermissions')
		return args
	},
}
