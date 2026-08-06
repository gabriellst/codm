import { describe, expect, it, mock } from 'bun:test'
import { BaseError } from '@codm/core-typescript'
import { AgentStreamRegistry, type TerminalOutputFrame } from './AgentStreamRegistry'
import type { ApplicationErrors, DomainErrors } from '../../errors'

const buildFrame = (): TerminalOutputFrame => ({
	name: 'browser.terminal_output_appended',
	issueId: 'issue-1',
	line: 'compiling…',
	at: new Date().toISOString(),
	stream: 'stdout',
})

describe('AgentStreamRegistry — observer channel (whatscode port adopted whole, rekeyed issueId)', () => {
	it('registers a writer and exposes get/has', () => {
		const registry = new AgentStreamRegistry()
		const writer = (): Promise<void> => Promise.resolve()

		const unregister = registry.register('issue-1', 'owner-1', writer)

		expect(registry.has('issue-1')).toBe(true)
		expect(registry.get('issue-1')).toBe(writer)

		unregister()
		expect(registry.has('issue-1')).toBe(false)
	})

	it('throws SESSION_ALREADY_STREAMING on double-register for same issue', () => {
		const registry = new AgentStreamRegistry()
		const writer = (): Promise<void> => Promise.resolve()

		registry.register('issue-2', 'owner-1', writer)

		expect(() => registry.register('issue-2', 'owner-1', writer)).toThrow(
			expect.objectContaining({ name: 'SESSION_ALREADY_STREAMING' }) as BaseError<DomainErrors>,
		)
	})

	it('enforces MAX_STREAMS_PER_OWNER', () => {
		const registry = new AgentStreamRegistry()
		const writer = (): Promise<void> => Promise.resolve()

		for (let i = 0; i < AgentStreamRegistry.MAX_STREAMS_PER_OWNER; i++) {
			registry.register(`issue-${i}`, 'owner-A', writer)
		}

		expect(() => registry.register('issue-overflow', 'owner-A', writer)).toThrow(
			expect.objectContaining({ name: 'TOO_MANY_TERMINAL_STREAMS' }) as BaseError<ApplicationErrors>,
		)
	})

	it('decrements the per-owner counter on unregister', () => {
		const registry = new AgentStreamRegistry()
		const writer = (): Promise<void> => Promise.resolve()
		const unregister = registry.register('issue-3', 'owner-B', writer)

		expect(registry.ownerCount('owner-B')).toBe(1)
		unregister()
		expect(registry.ownerCount('owner-B')).toBe(0)
	})

	describe('send', () => {
		it('delivers the frame to the registered writer', async () => {
			const registry = new AgentStreamRegistry()
			const writer = mock((): void => {})
			registry.register('issue-1', 'owner-1', writer)

			const frame = buildFrame()
			await registry.send('issue-1', frame)

			expect(writer).toHaveBeenCalledTimes(1)
			expect(writer).toHaveBeenCalledWith(frame)
		})

		it('delivers nothing when no writer is registered (headless run) — but KEEPS the frame', async () => {
			const registry = new AgentStreamRegistry()

			await expect(registry.send('issue-1', buildFrame())).resolves.toBeUndefined()

			// Before F3 the frame was gone here, and that was the whole bug: output produced while
			// nobody was observing could never be shown to anybody afterwards.
			expect(registry.historyFor('issue-1')).toHaveLength(1)
		})

		it('force-unregisters the issue when the writer throws', async () => {
			const registry = new AgentStreamRegistry()
			const failingWriter = mock(() => {
				throw new Error('client hung up')
			})
			registry.register('issue-1', 'owner-1', failingWriter)

			await registry.send('issue-1', buildFrame())

			expect(failingWriter).toHaveBeenCalledTimes(1)
			expect(registry.has('issue-1')).toBe(false)
			expect(registry.ownerCount('owner-1')).toBe(0)
		})
	})
})

/**
 * F3 — THE PANEL SHOWS WHAT ALREADY HAPPENED.
 *
 * The observer channel was a pure live tail: `send` dropped every frame that arrived while no browser
 * was attached, so opening an issue thirty seconds into a run showed a blank panel that slowly filled
 * from wherever the run happened to be, and navigating away lost the lot. Both halves of the founder's
 * report ("não atualiza ao vivo e não recupera ao sair e voltar") come from that one omission.
 *
 * The buffer is deliberately in memory: these are TRANSPORT frames — the two-stream split says they
 * ride no outbox — and the durable account of what an agent did is the `AgentMessageEvent` /
 * `AgentToolCallEvent` facts. It does not survive a daemon restart, which is a real limit and a
 * stated one.
 */
describe('AgentStreamRegistry — replay buffer (F3)', () => {
	const frameAt = (issueId: string, line: string): TerminalOutputFrame => ({
		name: 'browser.terminal_output_appended',
		issueId,
		line,
		at: new Date().toISOString(),
		stream: 'stdout',
	})

	/**
	 * AC-F3.1 — attaching mid-run yields what the run already emitted.
	 *
	 * FALSIFIER: delete the `this.record(issueId, frame)` line from `send` and this goes red.
	 */
	it('AC-F3.1 — frames emitted BEFORE an observer attaches are replayed to it', async () => {
		const registry = new AgentStreamRegistry()
		await registry.send('issue-1', frameAt('issue-1', 'resolving deps'))
		await registry.send('issue-1', frameAt('issue-1', 'compiling…'))

		// What the controller replays the moment the observer is admitted.
		expect(registry.historyFor('issue-1').map(f => (f as TerminalOutputFrame).line)).toEqual(['resolving deps', 'compiling…'])
	})

	/**
	 * AC-F3.2 — leaving the screen and coming back does not lose the tail.
	 *
	 * `attach` is what `StreamTerminalSessionController.onStart` does: take the observer slot, then push
	 * the buffer at the new writer before any further frame reaches it live.
	 */
	const attach = (registry: AgentStreamRegistry, issueId: string): { seen: string[]; detach: () => void } => {
		const seen: string[] = []
		const detach = registry.register(issueId, 'owner-1', frame => {
			seen.push((frame as TerminalOutputFrame).line)
		})
		for (const frame of registry.historyFor(issueId)) seen.push((frame as TerminalOutputFrame).line)
		return { seen, detach }
	}

	it('AC-F3.2 — a panel re-opened after leaving replays everything, including what it missed', async () => {
		const registry = new AgentStreamRegistry()

		const first = attach(registry, 'issue-1')
		await registry.send('issue-1', frameAt('issue-1', 'before you left'))
		expect(first.seen).toEqual(['before you left'])

		first.detach()
		await registry.send('issue-1', frameAt('issue-1', 'while you were away'))

		// The operator comes back. The panel starts empty (the hook clears on every open) and is filled
		// entirely from the replay — so it must contain BOTH halves, in order.
		const second = attach(registry, 'issue-1')

		expect(second.seen).toEqual(['before you left', 'while you were away'])
	})

	it('the live writer still gets its frame exactly once — recording is not a second delivery', async () => {
		const registry = new AgentStreamRegistry()
		const writer = mock((): void => {})
		registry.register('issue-1', 'owner-1', writer)

		await registry.send('issue-1', frameAt('issue-1', 'one'))

		expect(writer).toHaveBeenCalledTimes(1)
		expect(registry.historyFor('issue-1')).toHaveLength(1)
	})

	it('keeps issues apart — one panel never replays another issue’s run', async () => {
		const registry = new AgentStreamRegistry()
		await registry.send('issue-1', frameAt('issue-1', 'mine'))
		await registry.send('issue-2', frameAt('issue-2', 'theirs'))

		expect(registry.historyFor('issue-1').map(f => (f as TerminalOutputFrame).line)).toEqual(['mine'])
		expect(registry.historyFor('issue-2').map(f => (f as TerminalOutputFrame).line)).toEqual(['theirs'])
	})

	it('caps the frames per issue, dropping the OLDEST — a long run must not grow the daemon', async () => {
		const registry = new AgentStreamRegistry()
		const overflow = AgentStreamRegistry.MAX_HISTORY_FRAMES + 10
		for (let i = 0; i < overflow; i++) await registry.send('issue-1', frameAt('issue-1', `line ${i}`))

		const kept = registry.historyFor('issue-1')
		expect(kept).toHaveLength(AgentStreamRegistry.MAX_HISTORY_FRAMES)
		// The TAIL is what a terminal panel is for; the first ten lines are what fell off.
		expect((kept[0] as TerminalOutputFrame).line).toBe('line 10')
		expect((kept.at(-1) as TerminalOutputFrame).line).toBe(`line ${overflow - 1}`)
	})

	it('caps how many issues hold a buffer, evicting the least recently written', async () => {
		const registry = new AgentStreamRegistry()
		for (let i = 0; i < AgentStreamRegistry.MAX_HISTORY_ISSUES; i++) await registry.send(`issue-${i}`, frameAt(`issue-${i}`, 'x'))

		// Touching issue-0 makes it the most recent, so the next eviction must take issue-1 instead.
		await registry.send('issue-0', frameAt('issue-0', 'y'))
		await registry.send('newcomer', frameAt('newcomer', 'z'))

		expect(registry.historyFor('newcomer')).toHaveLength(1)
		expect(registry.historyFor('issue-0')).toHaveLength(2)
		expect(registry.historyFor('issue-1')).toHaveLength(0)
	})
})
