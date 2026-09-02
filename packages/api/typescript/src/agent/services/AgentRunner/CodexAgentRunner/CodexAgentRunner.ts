import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { injectable } from 'tsyringe-neo'
import { z, type ZodType } from 'zod'
import { AgentModelId, StopKind } from '@codm/contracts-typescript/wire/enums'
import { AgentIdentityService, LoggingService } from '@codm/core-typescript'
import { ProductConfig } from '@shared/config/ProductConfig'
import { MCP_RUN_TOKEN_ENV, MCP_SERVER_KEY } from '../../../mcp/wire'
import { AgentRunOutcome, type TransportStopKind } from '../../../enums'
import type { AgentMcpInvocation } from '../../../types/AgentMcpInvocation'
import type { AgentRunRequest } from '../../../types/AgentRunRequest'
import type { AgentRunResult, AgentRuntimeEvent } from '../../../types/AgentRuntimeEvent'
import type { ProviderBinarySpec } from '../../../types/ProviderBinarySpec'
import { CodexFrameDecoder, StreamJsonCodec, StreamJsonToTurnFactAccumulator, type TerminalResultRecord } from '../../StreamJsonCodec'
import { AgentRunner } from '../AgentRunner'
import { nodeAgentProcessSpawner, type AgentProcess, type AgentProcessSpawner } from '../ClaudeAgentRunner/AgentProcess'

export interface CodexAgentRunnerOptions {
	spawner?: AgentProcessSpawner
	inactivityMs?: number
}

/** The inputs `buildArgs` needs, and nothing else — see the method's docblock on why this is a parameter bag. */
export interface CodexBuildArgsOptions {
	/** `AgentModelId.DEFAULT` means OMIT the model flag entirely — not "pass the string DEFAULT". */
	model?: AgentModelId
	cwd: string
	extraDirs?: readonly string[]
	resumeSessionId?: string
	mcp?: AgentMcpInvocation
	/** Absolute path of the JSON Schema file, when the run is structured. Written by `run()`, never here. */
	outputSchemaPath?: string
}

/**
 * `AgentModelId` → the slug `-m` takes. A MAP, not a `switch`, and per-runner for the same reason
 * `CLAUDE_MODEL_ALIASES` is: what a binary calls its models is a fact about that binary alone. This is
 * also the ONLY place a codex slug is spelled — the wire enum carries a member name, never the slug.
 *
 * MEASURED, and the measurement is why this map is small and why `DEFAULT` stays absent from it:
 * `.specs/codedm/2026-08-27-codex-driving-measured.md` §6 Q3 caught the per-account list changing
 * wholesale between two logins on one machine. So a slug here is a CLAIM about the account this build
 * talks to, and the failure mode when the claim is wrong is a loud one the transport already reports —
 * codex answers `not supported for your account`, which arrives as a 400 on the turn (§5 point 3),
 * never as a silent substitution. `DEFAULT` is the way back for whoever picked a slug the account
 * stopped serving, which is why the catalog always offers it.
 */
const CODEX_MODEL_ALIASES: Partial<Record<AgentModelId, string>> = {
	[AgentModelId.GPT_5_3_CODEX]: 'gpt-5.3-codex',
	[AgentModelId.GPT_5_2_CODEX]: 'gpt-5.2-codex',
	[AgentModelId.GPT_5_1_CODEX]: 'gpt-5.1-codex',
}

/**
 * The same `/login`-shaped stderr the claude runner watches for, re-stated rather than shared.
 *
 * Sharing it would make one CLI's phrasing govern the other's diagnosis, and these are different
 * products with different auth flows: codex says `codex login`, claude says `/login`. The pattern
 * covers both spellings because a regex is cheap; the DECISION to keep it per-runner is what matters.
 */
const AUTH_HINT = /codex login|\/login\b|not logged in|please log ?in|authentication (?:required|failed)|unauthorized/i

/**
 * Drives the `codex` CLI. A SIBLING of `ClaudeAgentRunner`, never a mode of it (AC-4.5.3).
 *
 * Everything below is MEASURED against codex-cli 0.150.0 and the captures committed under
 * `.specs/codedm/codex-smoke/` — the spec is `.specs/codedm/2026-08-27-codex-driving-measured.md`.
 * Where a shape was NOT measured, it says so instead of pretending.
 *
 * ### The four ways this CLI is not claude, each of which would be a bug if ported by analogy
 *
 * 1. **THE PROMPT RIDES ON ARGV, AND STDIN MUST BE CLOSED.** `codex exec` takes the prompt as a
 *    positional, and then reads stdin ANYWAY: a run with stdin left open hung for three minutes and
 *    had to be killed, while the identical run with stdin at EOF finished in ~8s. So the spawn asks
 *    for `stdin: false` — which the seam already spells `'ignore'`, and whose own docblock says
 *    "`false` when the prompt rode in on argv". There is no stdin choreography here at all, and no
 *    `closeStdin()`: nothing this runner does can end a turn early, because the turn's whole input
 *    was delivered at spawn.
 *
 *    A corollary worth stating because it looks like a signal and is not: stderr prints
 *    `Reading additional input from stdin...` UNCONDITIONALLY, including on runs that completed in
 *    8s with stdin already at EOF. It is neither a liveness signal nor a hang signal, and a watchdog
 *    keyed on it would be wrong in both directions.
 *
 * 2. **RESUME IS A DIFFERENT ARGV SHAPE, NOT ONE MORE FLAG.** claude adds `--resume <id>` to an
 *    otherwise identical argv. codex has a SUBCOMMAND, `codex exec resume [SESSION_ID] [PROMPT]`,
 *    whose flag set is strictly narrower — measured against the committed `--help` captures, it has
 *    no `-s/--sandbox`, no `-C/--cd` and no `--add-dir`. Sandbox and working directory are not
 *    re-expressible on a resumed turn; they come from the recorded session. `buildArgs` therefore
 *    branches on SHAPE, once, at the top, rather than sprinkling `if (resume)` through a flag list.
 *
 * 3. **STRUCTURED OUTPUT IS A FILE, NOT A PROMPT.** `--output-schema <FILE>` is native here, so the
 *    schema is handed to the CLI instead of described to the model in prose. That is strictly better
 *    than claude's directive — it is the CLI's own contract rather than an instruction the model may
 *    ignore — and it costs this runner the one bit of filesystem I/O it does: a temp file, written
 *    before spawn and removed in `finally`. Measured to work: `raw/s3-schema.jsonl` produced a valid
 *    object from a local model that was otherwise confused.
 *
 * 4. **THERE IS NO `--mcp-config`.** MCP servers live in `~/.codex/config.toml`, and a per-run server
 *    is declared with inline `-c mcp_servers.<key>.*` overrides. Measured to actually spawn the
 *    server with both args and env — `raw/mcp-proof.json` is the child process's own receipt — and
 *    to leave the user's `config.toml` untouched, which is the property that makes it usable at all.
 *
 * ### What it shares, and why that is not accidental
 * `LineBuffer`, `JSON.parse`, the never-throw policy, the inactivity watchdog, the process-group
 * kill, the `finally` that revokes the run token. Those are transport-agnostic, and they are shared
 * as COLLABORATORS (`StreamJsonCodec` takes the decoder as a parameter) rather than by inheritance.
 * The wire grammar is the part that differs, and it lives in `CodexFrameDecoder`.
 */
@injectable()
export class CodexAgentRunner extends AgentRunner {
	/**
	 * How this CLI is FOUND and asked what it supports. Replaces the placeholder literal that used to
	 * sit in `PROVIDER_BINARIES` — the extension path that file's docblock describes, taken.
	 *
	 * THE TOKENS ARE NOT FLAGS, and that is the correction this spec carries. The placeholder declared
	 * `--mcp-config` and `--resume`, neither of which codex publishes: measured against its own
	 * committed help (`raw/help-root.txt`), MCP is a config key and resume is a SUBCOMMAND. The probe
	 * greps help text for whatever string is declared here, so the subcommand names are the honest
	 * keys — with the old literal, this CLI reported both capabilities ABSENT while having both, and
	 * the runner would have been driven with no tools and a re-rendered transcript in every prompt.
	 */
	static readonly binary: ProviderBinarySpec = {
		bin: 'codex',
		versionArgs: ['--version'],
		helpArgs: ['--help'],
		capabilityTokens: {
			// `mcp  Manage external MCP servers for Codex` — the subcommand's presence is what says the
			// binary speaks MCP at all. HOW we declare a server is this runner's business (point 4).
			mcp: 'mcpConfig',
			// `resume  Resume a previous interactive session` — see point 2.
			resume: 'sessionResume',
		},
	}

	// NOT `readonly` and NOT constructor parameters — same reason as the claude runner: an optional
	// constructor parameter emits `Object` for `design:paramtypes` and tsyringe throws at resolution.
	private spawner: AgentProcessSpawner = nodeAgentProcessSpawner
	private inactivityMs = ProductConfig.env.CODM_AGENT_INACTIVITY_MS
	private readonly live = new Set<AgentProcess>()

	constructor(
		private readonly logging: LoggingService,
		private readonly identities: AgentIdentityService,
	) {
		super()
	}

	/** Test seam. The constructor stays DI-resolvable; overrides come through here. */
	static withOptions(logging: LoggingService, identities: AgentIdentityService, options: CodexAgentRunnerOptions): CodexAgentRunner {
		const runner = new CodexAgentRunner(logging, identities)
		if (options.spawner) runner.spawner = options.spawner
		if (options.inactivityMs !== undefined) runner.inactivityMs = options.inactivityMs
		return runner
	}

	/**
	 * argv, as a PURE static function of its arguments — no `this`, no ambient capability lookup, no
	 * clock, no filesystem. The prompt is NOT here: it is appended by `run()`, because it is the one
	 * argument that depends on the request's messages rather than on its shape.
	 *
	 * `--json` and `--skip-git-repo-check` are unconditional. The first is the whole reason this
	 * transport is parseable; the second because a thread's workspace is an arbitrary directory the
	 * operator chose and codex otherwise refuses to run outside a git repo — a refusal that would
	 * surface as a failed turn for a reason that has nothing to do with the turn.
	 */
	static buildArgs({ model, cwd, extraDirs, resumeSessionId, mcp, outputSchemaPath }: CodexBuildArgsOptions): string[] {
		// SHAPE FIRST — see point 2 of the class docblock. The narrower set is not a subset chosen for
		// tidiness; `-C` and `--add-dir` do not EXIST on resume, and passing one aborts the run.
		const args = resumeSessionId ? ['exec', 'resume'] : ['exec']
		args.push('--json', '--skip-git-repo-check')

		if (!resumeSessionId) {
			// The working directory is expressed twice on purpose — as the spawn's `cwd` AND as `-C`.
			// The spawn's cwd is what the OS gives the child; `-C` is what codex records in the session,
			// and a resumed turn reads it from there rather than from wherever the daemon happens to be.
			args.push('-C', cwd)
			for (const dir of extraDirs ?? []) args.push('--add-dir', dir)
		}

		// `-m` lives OUTSIDE the resume guard because both help captures list it (`help-exec.txt:40`,
		// `help-exec-resume.txt:41`) — unlike `-C`/`--add-dir`, which exist on one shape only. A resumed
		// turn therefore re-states the model rather than inheriting whatever the session was opened with.
		//
		// DEFAULT ⇒ omit the flag entirely so the CLI chooses. An unmapped member (a value added to the
		// wire enum without a codex slug, e.g. a claude model reaching here) also omits rather than
		// passing a bogus string — the catalog is what makes that unreachable, this is what makes it
		// harmless. See `CODEX_MODEL_ALIASES` for why pinning slugs at all is a decision under a
		// measurement that says the account's list churns.
		const modelAlias = model && model !== AgentModelId.DEFAULT ? CODEX_MODEL_ALIASES[model] : undefined
		if (modelAlias) args.push('-m', modelAlias)

		if (outputSchemaPath) args.push('--output-schema', outputSchemaPath)

		// Point 4: inline TOML overrides, one `-c` per leaf. The run token rides in `env` for the stdio
		// transport exactly as it does for claude's stdio branch — never in a tool argument, never in
		// the prompt.
		if (mcp) args.push(...renderMcpOverrides(mcp))

		// The session id is a POSITIONAL on the resume shape, and it must precede the prompt.
		if (resumeSessionId) args.push(resumeSessionId)
		return args
	}

	/**
	 * The child environment this invocation needs, or nothing.
	 *
	 * ONLY the http branch needs one, and only because its config carries a variable NAME (see
	 * `renderMcpOverrides`). The stdio branch declares the child's env inside the config instead, so
	 * putting the token in codex's own environment there would widen its exposure for no gain.
	 *
	 * STATIC and PURE for the same reason `buildArgs` is: it is a rendering decision about an
	 * invocation, testable without a process anywhere near it.
	 */
	static mcpEnv(mcp: AgentMcpInvocation | undefined): Record<string, string> | undefined {
		return mcp?.transport === 'http' ? { [MCP_RUN_TOKEN_ENV]: mcp.token } : undefined
	}

	async *run<OutputSchema extends ZodType | undefined = undefined>(
		request: AgentRunRequest<OutputSchema>,
	): AsyncIterable<AgentRuntimeEvent> {
		const warn = (message: string): void =>
			this.logging.warn({ content: { message, agentName: request.agentName, bin: CodexAgentRunner.binary.bin } })

		const codec = new StreamJsonCodec({ onWarn: warn, decoder: new CodexFrameDecoder(warn) })
		const accumulator = new StreamJsonToTurnFactAccumulator({})

		// The schema file has to exist BEFORE the spawn and outlive nothing — hence a scratch dir this
		// run owns and removes in `finally`, rather than a path in the workspace the agent can see.
		const schema = request.outputSchema ? writeOutputSchema(request.outputSchema) : undefined

		let proc: AgentProcess
		try {
			const args = CodexAgentRunner.buildArgs({
				model: request.model,
				cwd: request.cwd,
				extraDirs: request.extraDirs,
				resumeSessionId: request.session?.resumeId,
				mcp: request.mcp,
				outputSchemaPath: schema?.path,
			})
			// The prompt LAST, as the trailing positional both shapes end with.
			proc = this.spawner({
				cmd: [request.binaryPath, ...args, renderPrompt(request)],
				cwd: request.cwd,
				stdin: false,
				env: CodexAgentRunner.mcpEnv(request.mcp),
			})
		} catch (cause) {
			schema?.cleanup()
			if (request.mcp) this.identities.revoke(request.mcp.token)
			yield {
				type: 'finished',
				result: failure(`${StopKind.SERVER_ERROR}: ${String(cause)}`),
			}
			return
		}
		this.live.add(proc)

		const stderrChunks: string[] = []
		const stderrPump = drainToStrings(proc.stderr, stderrChunks)

		let terminal: TerminalResultRecord | undefined
		let sessionId: string | null = null
		let watchdogFired = false

		const onAbort = (): void => {
			proc.kill()
		}
		request.signal?.addEventListener('abort', onAbort, { once: true })

		try {
			const iterator = proc.stdout[Symbol.asyncIterator]()
			let pending: Promise<IteratorResult<Uint8Array | string>> | null = null
			let deadlineAt = Date.now() + this.inactivityMs

			for (;;) {
				let timer: ReturnType<typeof setTimeout> | undefined
				const step = pending ?? iterator.next()
				pending = step
				const timeout = new Promise<'timeout'>(resolve => {
					timer = setTimeout(() => resolve('timeout'), Math.max(deadlineAt - Date.now(), 0))
				})
				const settled = await Promise.race([step, timeout])
				clearTimeout(timer)

				if (settled === 'timeout') {
					watchdogFired = true
					warn(`no output for ${this.inactivityMs}ms — killing the run (watchdog backstop)`)
					step.catch(() => {
						// no-op: the raced promise outlives this loop and would otherwise reject unhandled.
					})
					proc.kill()
					break
				}
				pending = null
				if (settled.done) break

				// FRAMES, not bytes — a CLI that is streaming a very long reasoning item is alive, and a
				// CLI that is emitting nothing is not, regardless of how many bytes each is worth.
				let sawFrame = false
				for (const decoded of codec.push(settled.value)) {
					for (const frame of decoded.frames) {
						sawFrame = true
						if (frame.kind === 'system_init') sessionId = frame.sessionId
						yield { type: 'frame', frame }
						const fact = accumulator.apply(frame)
						if (fact) yield { type: 'fact', fact }
					}
					if (decoded.terminal) {
						terminal = decoded.terminal
						if (decoded.terminal.sessionId) sessionId = decoded.terminal.sessionId
						// NO stdin decision to make here — see point 1. claude closes stdin on a non-TOOL_USE
						// terminal because its turn is a live stream; this turn's input was complete at spawn.
					}
				}
				if (sawFrame) deadlineAt = Date.now() + this.inactivityMs
			}

			for (const decoded of codec.flush()) {
				for (const frame of decoded.frames) {
					yield { type: 'frame', frame }
					const fact = accumulator.apply(frame)
					if (fact) yield { type: 'fact', fact }
				}
				if (decoded.terminal) terminal = decoded.terminal
			}

			const exitCode = await proc.exited.catch(() => -1)
			await stderrPump

			for (const fact of accumulator.flush()) yield { type: 'fact', fact }

			yield {
				type: 'finished',
				result: this.buildResult(request, { terminal, sessionId, exitCode, watchdogFired, stderr: stderrChunks.join('') }),
			}
		} finally {
			request.signal?.removeEventListener('abort', onAbort)
			this.live.delete(proc)
			proc.kill()
			schema?.cleanup()
			// The MCP server connects at process BOOT, before the turn resolves — measured: an
			// auth-failed run still logged `rmcp::transport::worker` errors. So the token is live from
			// spawn, not from the first tool call, and this `finally` is the only correct place to
			// revoke it. Opaque here, as it is for claude: the runner revokes a string, never learning
			// whose issue it belonged to.
			if (request.mcp) this.identities.revoke(request.mcp.token)
		}
	}

	/**
	 * Fold what was observed into the one terminal record. Never throws.
	 *
	 * The structured branch reads the SAME reply text as the unstructured one, and that is worth
	 * stating: `--output-schema` constrains the model, it does not change where the answer lands. The
	 * answer is still the last `agent_message`, which `CodexFrameDecoder` carried onto the terminal
	 * record because `turn.completed` has no text of its own.
	 */
	private buildResult<OutputSchema extends ZodType | undefined>(
		request: AgentRunRequest<OutputSchema>,
		observed: { terminal?: TerminalResultRecord; sessionId: string | null; exitCode: number; watchdogFired: boolean; stderr: string },
	): AgentRunResult {
		const replyText = observed.terminal?.text ?? ''
		const stop = this.classifyStop(observed)

		if (stop) return { outcome: AgentRunOutcome.STOPPED, replyText, sessionId: observed.sessionId, failed: false, stop }
		if (!request.outputSchema) return { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, failed: false }

		let candidate: unknown
		try {
			candidate = JSON.parse(replyText.trim())
		} catch {
			return {
				outcome: AgentRunOutcome.COMPLETED,
				replyText,
				sessionId: observed.sessionId,
				failed: true,
				failure: 'terminal reply text was not JSON',
			}
		}
		const parsed = request.outputSchema.safeParse(candidate)
		return parsed.success
			? { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, output: parsed.data, failed: false }
			: { outcome: AgentRunOutcome.COMPLETED, replyText, sessionId: observed.sessionId, failed: true, failure: parsed.error.message }
	}

	private classifyStop(observed: {
		terminal?: TerminalResultRecord
		exitCode: number
		watchdogFired: boolean
		stderr: string
	}): AgentRunResult['stop'] {
		// TRANSPORT evidence only — stderr. The reply text is deliberately excluded for the same reason
		// it is on the claude side: a run that merely TALKS about logging in must not be diagnosed as a
		// transport failure. codex has no `api_error_status` counterpart, so stderr is the whole signal.
		if (AUTH_HINT.test(observed.stderr)) {
			return { kind: StopKind.AUTH_REQUIRED as TransportStopKind, detail: 'provider CLI is asking for interactive login' }
		}

		// A TERMINAL EVENT WINS OVER THE WATCHDOG, same discipline as claude and for the same reason:
		// a turn that closed on its own merits must not be reclassified by a backstop that fires while
		// the child lingers. There is no TOOL_USE case to except here — codex has no stop reason at all,
		// so `turn.completed` arriving IS the turn ending.
		if (observed.terminal) {
			return observed.terminal.isError
				? { kind: StopKind.SERVER_ERROR as TransportStopKind, detail: observed.terminal.text || 'provider reported a failed turn' }
				: undefined
		}

		// NO TERMINAL EVENT AT ALL is the measured shape of a cancelled run: SIGKILL 25s into a turn
		// left three complete lines, a trailing newline, and neither `turn.completed` nor `turn.failed`
		// (`raw/s6-cancel.jsonl`). So a killed run's verdict has to be synthesized from the absence plus
		// the exit code, which is exactly what the two branches below do.
		if (observed.watchdogFired) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `no output for ${this.inactivityMs}ms — killed by the inactivity watchdog`,
			}
		}
		if (observed.exitCode !== 0) {
			return {
				kind: StopKind.SERVER_ERROR as TransportStopKind,
				detail: `provider exited with code ${observed.exitCode}${observed.stderr ? `: ${observed.stderr.trim()}` : ''}`,
			}
		}
		return undefined
	}

	async shutdown(): Promise<void> {
		for (const proc of this.live) proc.kill()
		this.live.clear()
	}
}

function failure(detail: string): AgentRunResult {
	return {
		outcome: AgentRunOutcome.STOPPED,
		replyText: '',
		sessionId: null,
		failed: false,
		stop: { kind: StopKind.SERVER_ERROR as TransportStopKind, detail },
	}
}

/**
 * `AgentMcpInvocation` → the inline `-c` overrides codex takes instead of a config flag.
 *
 * One `-c` per LEAF, because that is the shape the CLI accepts: `-c mcp_servers.<key>.command=…`,
 * `.args=[…]`, `.env={…}`.
 *
 * THE VALUE GRAMMAR IS TOML, NOT JSON. `-c` overrides the same `~/.codex/config.toml` the CLI reads,
 * and its own help says so outright (`raw/help-root.txt:46-52`): *"The `value` portion is parsed as
 * TOML. If it fails to parse as TOML, the raw string is used as a literal."* The two grammars coincide
 * on the leaves rendered as scalars and arrays (`"node"`, `["/srv.js"]` are valid in both) — which is
 * the trap, because they DIVERGE on the inline table, and the table is the one leaf carrying the run
 * token. TOML writes it `{KEY="value"}`: `=`, not `:`.
 *
 * Both branches below were MEASURED against codex-cli 0.150.0 with `codex mcp list -c …`, which
 * resolves the config and prints the server without spawning a model — a falsifier that costs nothing
 * and is why neither shape is guessed any more (`raw/config-parse-probe.txt`):
 *
 *   env={CODM_RUN_TOKEN="tok"}       →  Env  CODM_RUN_TOKEN=*****
 *   env={"CODM_RUN_TOKEN":"tok"}     →  Error: failed to load bootstrap configuration
 *                                       invalid type: string "{\"CODM_RUN_TOKEN\":\"tok\"}",
 *                                       expected a map in `mcp_servers.codm.env`
 *   bearer_token_env_var="CODM_…"    →  Bearer Token Env Var  CODM_RUN_TOKEN   Auth: Bearer token
 *   bearer_token="tok"               →  Error: bearer_token is not supported for streamable_http
 *
 * So a JSON rendering does not degrade — the fallback turns it into a STRING, the deserializer wants a
 * map, and the whole config load aborts. The run dies at startup rather than losing its tools quietly.
 *
 * THE HTTP BRANCH TAKES A VARIABLE NAME, NOT A TOKEN, and that is a real difference in kind rather
 * than a spelling: `bearer_token_env_var` names an env var codex reads at request time, so the value
 * has to reach the CLI's OWN environment (`run()` puts it there via `AgentProcessSpec.env`). The
 * pleasant consequence is that on this path the token never enters argv, so it is not in `ps` — unlike
 * the stdio branch here and both branches of the claude runner, where argv is the only carrier the CLI
 * offers. It authenticates against the same door: `bearer_token_env_var` sends
 * `Authorization: Bearer <value>`, which is exactly what `mcp/door.ts` resolves per call.
 */
function renderMcpOverrides(mcp: AgentMcpInvocation): string[] {
	const key = `mcp_servers.${MCP_SERVER_KEY}`
	if (mcp.transport === 'http') {
		return ['-c', `${key}.url=${JSON.stringify(mcp.endpoint)}`, '-c', `${key}.bearer_token_env_var=${JSON.stringify(MCP_RUN_TOKEN_ENV)}`]
	}
	return [
		'-c',
		`${key}.command=${JSON.stringify(mcp.command?.command ?? '')}`,
		'-c',
		`${key}.args=${JSON.stringify(mcp.command?.args ?? [])}`,
		'-c',
		`${key}.env={${MCP_RUN_TOKEN_ENV}=${JSON.stringify(mcp.token)}}`,
	]
}

/**
 * The turn, as the ONE prompt string codex's positional takes.
 *
 * claude receives several JSONL lines on stdin because several messages are the same LIVE turn there.
 * Here the whole turn is one argument, so the messages are joined — and the system prompt leads,
 * rather than being prepended to the first message, because there is no "first message" distinction
 * left once they are one string.
 *
 * NO structured-output directive, and that absence is the point of point 3: `--output-schema` hands
 * the CLI the contract, so describing the schema in prose as well would be a second, drifting copy of
 * it — the exact duplication the claude runner has to accept only because its CLI offers no such flag.
 *
 * KNOWN GAP — JOINING DROPS THE ROLES. `user` and `assistant` messages are concatenated with nothing
 * marking which was which, so a multi-message turn reads to the model as one undifferentiated block.
 * It is nearly unreachable in practice and that is the only reason it stands: `sessionResume` probes
 * TRUE on this binary, so after the first turn the transcript lives in the recorded session and
 * `messages` carries just the new one. The exposure is a FIRST turn built from several messages. If
 * that shape ever becomes real, the fix is role markers here — not a second prompt renderer.
 */
function renderPrompt(request: AgentRunRequest<ZodType | undefined>): string {
	const parts = request.systemPrompt ? [request.systemPrompt] : []
	for (const message of request.messages) parts.push(message.content)
	return parts.join('\n\n')
}

/** The schema file `--output-schema` reads, in a scratch dir this run owns and deletes. */
function writeOutputSchema(schema: ZodType): { path: string; cleanup: () => void } {
	const dir = mkdtempSync(join(tmpdir(), 'codex-output-schema-'))
	const path = join(dir, 'schema.json')
	writeFileSync(path, JSON.stringify(z.toJSONSchema(schema)), 'utf8')
	return {
		path,
		cleanup: () => {
			try {
				rmSync(dir, { recursive: true, force: true })
			} catch {
				// A scratch file the OS will reap is never worth failing a completed run over.
			}
		},
	}
}

async function drainToStrings(stream: AsyncIterable<Uint8Array | string>, sink: string[]): Promise<void> {
	try {
		for await (const chunk of stream) sink.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
	} catch {
		// A broken stderr pipe must never be the reason a run fails — stdout is the signal.
	}
}
