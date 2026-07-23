/**
 * Phase-10 REAL SMOKE — the extracted engine driving the REAL claude binary through the real code
 * path (ClaudeCliTerminalLLMRunner → spawner (Bun.Terminal) → ClaudeBootSequence → runTurn →
 * transcript tail → turn-end detectors). Asserts:
 *   1. session spawns via stream() (session/spawned runtime event observed)
 *   2. output frames observed (raw PTY lines) + a reply from the JSONL transcript tail
 *   3. turn completes (turn_completed) with the sentinel text
 *   4. transcript tail file exists and contains records
 *   5. clean teardown: killSession + shutdown → zero claude zombie processes
 */
import 'reflect-metadata'
import { execSync } from 'node:child_process'
import { mkdtempSync, existsSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { ClaudeCliTerminalLLMRunner } from '@terminal/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/ClaudeCliTerminalLLMRunner'
import { sessionFilePath } from '@terminal/services/TerminalLLMRunner/ClaudeCliTerminalLLMRunner/transcript'

const BIN = '/Applications/cmux.app/Contents/Resources/bin/claude'

function claudeProcCount(): number {
	try {
		const out = execSync(`ps ax -o command | grep -c '^${BIN.replace(/\//g, '\\/')}'`, { encoding: 'utf8', shell: '/bin/bash' })
		return Number(out.trim())
	} catch {
		return 0 // grep -c exits 1 on zero matches
	}
}

const cwd = mkdtempSync(join(tmpdir(), 'phase10-smoke-'))
console.log(`[smoke] scratch cwd: ${cwd}`)
console.log(`[smoke] claude procs before: ${claudeProcCount()}`)

const runner = new ClaudeCliTerminalLLMRunner()
const issueId = crypto.randomUUID()

let spawned = false
let outputFrames = 0
let replyText = ''
let turnCompleted = false
let terminalSessionId = ''

const startedAt = Date.now()
try {
	for await (const ev of runner.stream({
		issueId,
		threadId: crypto.randomUUID(),
		ownerId: 'smoke',
		provider: ProviderKind.CLAUDE_CODE,
		cwd,
		prompt: 'Reply with exactly the single word SMOKE-OK and nothing else. Do not use any tools.',
		binaryPath: BIN,
	})) {
		if (ev.type === 'session') {
			spawned = true
			terminalSessionId = ev.terminalSessionId
			console.log(`[smoke] session ${ev.lifecycle}: terminalSessionId=${ev.terminalSessionId}`)
		}
		if (ev.type === 'output') outputFrames++
		if (ev.type === 'reply') {
			replyText += ev.text
			console.log(`[smoke] reply chunk: ${JSON.stringify(ev.text.slice(0, 80))}`)
		}
		if (ev.type === 'action') console.log(`[smoke] action: ${ev.action} ${ev.value.slice(0, 60)}`)
		if (ev.type === 'stop') console.log(`[smoke] STOP: ${ev.kind} ${ev.detail.slice(0, 200)}`)
		if (ev.type === 'killed') console.log(`[smoke] KILLED: ${ev.reason}`)
		if (ev.type === 'turn_completed') {
			turnCompleted = true
			console.log(`[smoke] turn completed via ${ev.signal} after ${Date.now() - startedAt}ms`)
			break
		}
	}
} catch (err) {
	console.error('[smoke] stream threw:', err)
}

const transcriptPath = sessionFilePath(cwd, terminalSessionId || crypto.randomUUID())
const transcriptExists = terminalSessionId.length > 0 && existsSync(transcriptPath)
const transcriptBytes = transcriptExists ? statSync(transcriptPath).size : 0
console.log(`[smoke] transcript tail: ${transcriptPath} exists=${transcriptExists} bytes=${transcriptBytes}`)
console.log(`[smoke] outputFrames=${outputFrames} replyText=${JSON.stringify(replyText.trim().slice(0, 120))}`)

const snapBefore = await runner.getSession(issueId)
console.log(`[smoke] live session snapshot: ${JSON.stringify(snapBefore)}`)

await runner.killSession(issueId)
await runner.shutdown()
// Give the OS a moment to reap.
await new Promise(r => setTimeout(r, 1500))
const procsAfter = claudeProcCount()
console.log(`[smoke] claude procs after teardown: ${procsAfter}`)

rmSync(cwd, { recursive: true, force: true })

const pass =
	spawned && turnCompleted && outputFrames > 0 && replyText.includes('SMOKE-OK') && transcriptExists && transcriptBytes > 0 && procsAfter === 0
console.log(
	`[smoke] VERDICT: ${pass ? 'PASS' : 'FAIL'} (spawned=${spawned} turnCompleted=${turnCompleted} outputFrames=${outputFrames} replyHasSentinel=${replyText.includes('SMOKE-OK')} transcript=${transcriptExists}/${transcriptBytes}b zombies=${procsAfter})`,
)
process.exit(pass ? 0 : 1)
