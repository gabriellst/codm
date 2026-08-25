import { describe, expect, test } from 'bun:test'

import { declaredSupervisorPid, isOrphaned, startParentWatchdog } from './Watchdog'

const ALIVE = { parentPid: 4242, supervisorAlive: true }

describe('parent watchdog — the only defense that survives a SIGKILLed shell', () => {
	test('a daemon whose parent is still the shell that spawned it is not orphaned', () => {
		expect(isOrphaned('4242', ALIVE)).toBe(false)
	})

	test('a daemon reparented to launchd IS orphaned', () => {
		// This is the incident, verbatim: the shell was SIGKILLed, macOS handed the child to pid 1,
		// and it went on holding :3030 serving a stale catalog to a window that no longer had a backend.
		expect(isOrphaned('4242', { parentPid: 1, supervisorAlive: false })).toBe(true)
	})

	test('reparenting to anything else is orphaned too — the check is not `ppid === 1`', () => {
		// A subreaper (or a second shell) adopts the orphan instead of init. `ppid === 1` would miss it.
		expect(isOrphaned('4242', { parentPid: 9999, supervisorAlive: false })).toBe(true)
	})

	test('o ppid mudou mas a sonda ainda diz vivo (pid reutilizado, zumbi) — órfão mesmo assim', () => {
		expect(isOrphaned('4242', { parentPid: 1, supervisorAlive: true })).toBe(true)
	})

	test('no Windows o ppid está CONGELADO no spawn — o supervisor morto só aparece pela sonda de vida', () => {
		// Não há reparenting no Windows: `process.ppid` devolve o pid de quem criou o processo para
		// sempre, vivo ou não. Sem esta linha o watchdog nunca dispararia lá.
		expect(isOrphaned('4242', { parentPid: 4242, supervisorAlive: false })).toBe(true)
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
		expect(isOrphaned(raw as string | undefined, { parentPid: 1, supervisorAlive: false })).toBe(false)
	})

	test('no supervisor declared ⇒ no watchdog at all (not even a live timer)', () => {
		expect(startParentWatchdog({ supervisorPid: undefined, intervalMs: 1, onOrphaned: () => {} })).toBeNull()
	})

	test('the reaction fires once, and only after the parent actually changes', async () => {
		let parent = 4242
		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: '4242',
			currentParentPid: () => parent,
			supervisorAlive: () => true,
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

	test('com o ppid congelado (Windows), a morte do supervisor vista pela sonda também dispara — uma vez', async () => {
		let alive = true
		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: '4242',
			currentParentPid: () => 4242,
			supervisorAlive: () => alive,
			onOrphaned: () => {
				shutdowns += 1
			},
			intervalMs: 2,
		})

		await Bun.sleep(20)
		expect(shutdowns).toBe(0)

		alive = false
		await Bun.sleep(30)
		expect(shutdowns).toBe(1)

		await Bun.sleep(20)
		expect(shutdowns).toBe(1)

		stop?.()
	})

	test('a sonda default é real: um supervisor cujo pid já saiu dispara sem nenhum mock', async () => {
		// Flake teórico: reuso do pid do ghost entre `exited` e o tick do watchdog leria 'vivo'.
		// Pids são monotônicos nos SOs de CI (macOS/Linux); se este teste piscar um dia, é isso.
		const ghost = Bun.spawn([process.execPath, '-e', 'process.exit(0)'])
		await ghost.exited

		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: String(ghost.pid),
			// ppid "igual" ao supervisor, como no Windows — só a sonda pode ver que ele morreu.
			currentParentPid: () => ghost.pid,
			onOrphaned: () => {
				shutdowns += 1
			},
			intervalMs: 2,
		})
		await Bun.sleep(30)
		expect(shutdowns).toBe(1)
		stop?.()
	})

	test('a sonda default é real: o nosso próprio pai (o test runner) está vivo — nada dispara', async () => {
		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: String(process.ppid),
			onOrphaned: () => {
				shutdowns += 1
			},
			intervalMs: 2,
		})
		await Bun.sleep(20)
		expect(shutdowns).toBe(0)
		stop?.()
	})

	test('stopping it is enough to silence it', async () => {
		let shutdowns = 0
		const stop = startParentWatchdog({
			supervisorPid: '4242',
			currentParentPid: () => 1,
			supervisorAlive: () => false,
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
