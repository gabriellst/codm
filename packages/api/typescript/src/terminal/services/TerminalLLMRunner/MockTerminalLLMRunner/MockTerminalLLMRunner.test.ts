import { describe, it, expect, beforeEach } from 'bun:test'
import { ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { TurnEndSignal } from '../../../enums'
import { MockTerminalLLMRunner } from './MockTerminalLLMRunner'
import type { TerminalLLMRunnerStreamRequest } from '../TerminalLLMRunner'
import type { TerminalRuntimeEvent } from '../types'

describe('MockTerminalLLMRunner', () => {
	let runner: MockTerminalLLMRunner
	const baseReq: TerminalLLMRunnerStreamRequest = {
		issueId: '00000000-0000-4000-8000-000000000001',
		threadId: '00000000-0000-4000-8000-000000000002',
		ownerId: 'tenant',
		provider: ProviderKind.CLAUDE_CODE,
		cwd: '/tmp/repo',
		prompt: 'hi',
		systemPrompt: 'You are a test agent.',
		context: [],
	}

	beforeEach(() => {
		runner = new MockTerminalLLMRunner()
	})

	it('yields exactly the scripted event sequence in order', async () => {
		const scripted: TerminalRuntimeEvent[] = [
			{ type: 'reply', text: 'Mock reply delta' },
			{ type: 'turn_completed', signal: TurnEndSignal.JSONL_TURN_DURATION },
		]
		runner.pushScript(scripted)

		const collected: TerminalRuntimeEvent[] = []
		for await (const ev of runner.stream(baseReq)) collected.push(ev)

		expect(collected).toHaveLength(2)
		expect(collected[0]).toEqual({ type: 'reply', text: 'Mock reply delta' })
		expect(collected[1]).toMatchObject({ type: 'turn_completed' })
	})

	it('yields an empty stream when no script was pushed', async () => {
		const collected: TerminalRuntimeEvent[] = []
		for await (const ev of runner.stream(baseReq)) collected.push(ev)
		expect(collected).toHaveLength(0)
	})

	it('getSession returns null for an unknown issue', async () => {
		expect(await runner.getSession('issue-x')).toBeNull()
	})

	it('killSession is a no-op for an unknown issue', async () => {
		await runner.killSession('issue-x')
		// Just asserts it does not throw.
	})

	it('consecutive stream() calls each consume one script', async () => {
		runner.pushScript([{ type: 'reply', text: 'first' }])
		runner.pushScript([{ type: 'reply', text: 'second' }])

		const first: TerminalRuntimeEvent[] = []
		for await (const ev of runner.stream(baseReq)) first.push(ev)
		const second: TerminalRuntimeEvent[] = []
		for await (const ev of runner.stream(baseReq)) second.push(ev)

		expect(first[0]).toEqual({ type: 'reply', text: 'first' })
		expect(second[0]).toEqual({ type: 'reply', text: 'second' })
	})
})
