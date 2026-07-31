import { describe, expect, test } from 'bun:test'

import { declaredSupervisorPid, isOrphaned, startParentWatchdog } from './watchdog'

describe('parent watchdog — the only defense that survives a SIGKILLed shell', () => {
	test('a daemon whose parent is still the shell that spawned it is not orphaned', () => {
		expect(isOrphaned('4242', 4242)).toBe(false)
	})

	test('a daemon reparented to launchd IS orphaned', () => {
		// This is the incident, verbatim: the shell was SIGKILLed, macOS handed the child to pid 1,
		// and it went on holding :3030 serving a stale catalog to a window that no longer had a backend.
		expect(isOrphaned('4242', 1)).toBe(true)
	})

	test('reparenting to anything else is orphaned too — the check is not `ppid === 1`', () => {
		// A subreaper (or a second shell) adopts the orphan instead of init. `ppid === 1` would miss it.
		expect(isOrphaned('4242', 9999)).toBe(true)
	})

	test.each([
		['unset', undefined],
		['empty', ''],
		['blank', '   '],
		['not a number', 'nope'],
		['zero', '0'],
		['negative', '-1'],
		['fractional', '12.5'],
	])('an unsupervised daemon (%s pid) is NEVER orphaned', (_label, raw) => {
		// `bun dev`, `bun test` and the e2e harness all run with no shell above them. A false positive
		// here would shut the daemon down one second into every local session.
		expect(declaredSupervisorPid(raw as string | undefined)).toBeNull()
		expect(isOrphaned(raw as string | undefined, 1)).toBe(false)
	})

	test('no supervisor declared ⇒ no watchdog at all (not even a live timer)', () => {
		expect(startParentWatchdog({ supervisorPid: undefined, intervalMs: 1 })).toBeNull()
	})

	test('the reaction fires once, and only after the parent actually changes', async () => {
		let parent = 4242
		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: '4242',
			currentParentPid: () => parent,
			onOrphaned: () => {
				shutdowns += 1
			},
			intervalMs: 2,
		})
		expect(stop).not.toBeNull()

		await Bun.sleep(20)
		expect(shutdowns, 'enquanto o pai esta vivo o watchdog nao pode fazer nada').toBe(0)

		parent = 1
		await Bun.sleep(30)
		expect(shutdowns, 'o watchdog tem de reagir dentro de poucos ticks').toBe(1)

		await Bun.sleep(20)
		expect(shutdowns, 'e uma vez so — um shutdown reentrante atropela o proprio drain').toBe(1)

		stop?.()
	})

	test('stopping it is enough to silence it', async () => {
		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: '4242',
			currentParentPid: () => 1,
			onOrphaned: () => {
				shutdowns += 1
			},
			intervalMs: 2,
		})
		stop?.()
		await Bun.sleep(20)
		expect(shutdowns).toBe(0)
	})
})
