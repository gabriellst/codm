import { describe, expect, it, mock } from 'bun:test'
import { BaseError } from '@template/core-typescript'
import { TerminalSessionRegistry, type TerminalOutputFrame } from './TerminalSessionRegistry'
import type { ApplicationErrors, DomainErrors } from '../../errors'

const buildFrame = (): TerminalOutputFrame => ({ issueId: 'issue-1', line: 'compiling…', at: new Date().toISOString(), stream: 'stdout' })

describe('TerminalSessionRegistry — observer channel (ported AgentStreamRegistry, rekeyed issueId)', () => {
	it('registers a writer and exposes get/has', () => {
		const registry = new TerminalSessionRegistry()
		const writer = (): Promise<void> => Promise.resolve()

		const unregister = registry.register('issue-1', 'owner-1', writer)

		expect(registry.has('issue-1')).toBe(true)
		expect(registry.get('issue-1')).toBe(writer)

		unregister()
		expect(registry.has('issue-1')).toBe(false)
	})

	it('throws SESSION_ALREADY_STREAMING on double-register for same issue', () => {
		const registry = new TerminalSessionRegistry()
		const writer = (): Promise<void> => Promise.resolve()

		registry.register('issue-2', 'owner-1', writer)

		expect(() => registry.register('issue-2', 'owner-1', writer)).toThrow(
			expect.objectContaining({ name: 'SESSION_ALREADY_STREAMING' }) as BaseError<DomainErrors>,
		)
	})

	it('enforces MAX_STREAMS_PER_OWNER', () => {
		const registry = new TerminalSessionRegistry()
		const writer = (): Promise<void> => Promise.resolve()

		for (let i = 0; i < TerminalSessionRegistry.MAX_STREAMS_PER_OWNER; i++) {
			registry.register(`issue-${i}`, 'owner-A', writer)
		}

		expect(() => registry.register('issue-overflow', 'owner-A', writer)).toThrow(
			expect.objectContaining({ name: 'TOO_MANY_TERMINAL_STREAMS' }) as BaseError<ApplicationErrors>,
		)
	})

	it('decrements the per-owner counter on unregister', () => {
		const registry = new TerminalSessionRegistry()
		const writer = (): Promise<void> => Promise.resolve()
		const unregister = registry.register('issue-3', 'owner-B', writer)

		expect(registry.ownerCount('owner-B')).toBe(1)
		unregister()
		expect(registry.ownerCount('owner-B')).toBe(0)
	})

	describe('send', () => {
		it('delivers the frame to the registered writer', async () => {
			const registry = new TerminalSessionRegistry()
			const writer = mock((): void => {})
			registry.register('issue-1', 'owner-1', writer)

			const frame = buildFrame()
			await registry.send('issue-1', frame)

			expect(writer).toHaveBeenCalledTimes(1)
			expect(writer).toHaveBeenCalledWith(frame)
		})

		it('drops the frame silently when no writer is registered (headless run)', async () => {
			const registry = new TerminalSessionRegistry()
			await expect(registry.send('issue-1', buildFrame())).resolves.toBeUndefined()
		})

		it('force-unregisters the issue when the writer throws', async () => {
			const registry = new TerminalSessionRegistry()
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

describe('TerminalSessionRegistry — single-active-run guard (one session per issue)', () => {
	it('marks an issue active on beginSession and clears it on endSession', () => {
		const registry = new TerminalSessionRegistry()
		expect(registry.isActive('issue-1')).toBe(false)

		registry.beginSession('issue-1')
		expect(registry.isActive('issue-1')).toBe(true)

		registry.endSession('issue-1')
		expect(registry.isActive('issue-1')).toBe(false)
	})

	it('throws TERMINAL_ALREADY_RUNNING on a second concurrent begin for the same issue', () => {
		const registry = new TerminalSessionRegistry()
		registry.beginSession('issue-1')

		expect(() => registry.beginSession('issue-1')).toThrow(expect.objectContaining({ name: 'TERMINAL_ALREADY_RUNNING' }) as BaseError<DomainErrors>)
	})

	it('allows re-running an issue after its session ended', () => {
		const registry = new TerminalSessionRegistry()
		registry.beginSession('issue-1')
		registry.endSession('issue-1')
		expect(() => registry.beginSession('issue-1')).not.toThrow()
	})

	it('tracks distinct issues independently', () => {
		const registry = new TerminalSessionRegistry()
		registry.beginSession('issue-1')
		expect(() => registry.beginSession('issue-2')).not.toThrow()
		expect(registry.isActive('issue-1')).toBe(true)
		expect(registry.isActive('issue-2')).toBe(true)
	})
})
