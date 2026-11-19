import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { uuidv7 } from 'uuidv7'
import { CommandQueue, DatabaseDriver, DomainEventRepository, LoggingService } from '@codm/core-typescript'
import {
	MailboxClaimClass,
	MailboxItemKind,
	MailboxTargetKind,
	PermissionPosture,
	ProviderKind,
	SlotLimit,
} from '@codm/contracts-typescript/wire/enums'
import { TestBed } from '@test/support'
import { MOCK_CLOUD_OWNER_ID } from '@shared/services/CloudSession/MockCloudSession'
import { CloudSession } from '@shared/services/CloudSession'
import { ProductConfig, ProductEnvSchema } from '@shared/config/ProductConfig'
import { IssueHold } from '@issue/services/IssueHold'
import { ThreadRepository } from '@thread/repositories/ThreadRepository'
import { WorkspaceRepository } from '@workspace/repositories/WorkspaceRepository'
import { AgentSessionRepository } from '../../repositories/AgentSessionRepository'
import { IssueAttributesRepository } from '../../repositories/IssueAttributesRepository'
import { MailboxRepository } from '../../repositories/MailboxRepository'
import { IssueTurnAborter } from '../IssueTurnAborter'
import { IssueWorktreeJanitor } from '../IssueWorktreeJanitor'
import { FixedMachineCapacity, ISSUE_SLOTS_BY_DISK, ISSUE_SLOTS_FULL_MIN_FREE_BYTES, issueSlotsFor } from '../MachineCapacity'
import { MockQuotaLedgerReader } from '../QuotaBudget'
import { InMemoryQuotaStatus } from '../QuotaStatusReader'
import { ThroughputGate } from '../ThroughputGate'
import { LibSqlMailboxDispatcher, type TurnReport } from './LibSqlMailboxDispatcher'

/**
 * THE TASK SLOTS (fase 4, item 1): the effective number is the minimum of the configured maximum, the machine's disk
 * gate and the budget — with `limitedBy` naming the binding one — and the THREAD lane is never cut by any of them.
 *
 * Falsifier: drain on `this.lanes[kind].slots` again and the low-disk case runs the configured maximum of tasks.
 */
describe('LibSqlMailboxDispatcher — effective task slots', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: MOCK_CLOUD_OWNER_ID })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	const GIB = 1024 ** 3

	// Owner decision (19/11): free disk only OPENS slots 5–6 — it never takes away the 4 the daemon ran with before.
	it('the disk table: slots 5–6 only above the full-capacity threshold, and never below the pre-fase-4 four', () => {
		expect(issueSlotsFor({ diskFreeBytes: ISSUE_SLOTS_FULL_MIN_FREE_BYTES, memoryFreeShare: 0.5 })).toBe(6)
		expect(issueSlotsFor({ diskFreeBytes: ISSUE_SLOTS_FULL_MIN_FREE_BYTES - 1, memoryFreeShare: 0.5 })).toBe(4)
		expect(issueSlotsFor({ diskFreeBytes: 6 * GIB, memoryFreeShare: 0.5 })).toBe(4)
		expect(issueSlotsFor({ diskFreeBytes: 0, memoryFreeShare: 0.5 })).toBe(4)
		expect(
			Math.max(...ISSUE_SLOTS_BY_DISK.filter(row => row.minFreeBytes < ISSUE_SLOTS_FULL_MIN_FREE_BYTES).map(row => row.slots)),
		).toBeLessThan(5)
	})

	it('the configured maximum defaults to six, and "false" keeps the budget in observation', () => {
		expect(ProductConfig.env.CODM_AGENT_ISSUE_SLOTS_MAX).toBe(6)
		expect(ProductConfig.env.CODM_AGENT_QUOTA_ENFORCE).toBe(false)
		// the env arrives as a STRING: "false" must read false (a coercing boolean would read it true)
		const enforce = ProductEnvSchema.shape.CODM_AGENT_QUOTA_ENFORCE
		expect(enforce.parse('false')).toBe(false)
		expect(enforce.parse('true')).toBe(true)
		expect(enforce.parse(undefined)).toBe(false)
	})

	const until = async (predicate: () => boolean, timeoutMs: number): Promise<boolean> => {
		const deadline = Date.now() + timeoutMs
		while (Date.now() < deadline) {
			if (predicate()) return true
			await new Promise(resolve => setTimeout(resolve, 10))
		}
		return false
	}

	it('low disk: the task lane stays at the pre-fase-4 four (slots 5–6 closed) — and a conversation still starts', async () => {
		const machine = new FixedMachineCapacity()
		machine.script({ diskFreeBytes: 6 * GIB, memoryFreeShare: 0.5 })
		const status = testBed.resolve(InMemoryQuotaStatus)
		const gate = new ThroughputGate(
			new MockQuotaLedgerReader(),
			machine,
			testBed.resolve(IssueWorktreeJanitor),
			status,
			testBed.resolve(DatabaseDriver),
			testBed.resolve(DomainEventRepository),
			testBed.resolve(LoggingService),
		)

		let release = (): void => {}
		const gateOpen = new Promise<void>(resolve => {
			release = resolve
		})
		let inFlight = 0
		let peak = 0
		let threadStarted = false
		class HeldDispatcher extends LibSqlMailboxDispatcher {
			protected override async runIssueWork(): Promise<TurnReport> {
				inFlight += 1
				peak = Math.max(peak, inFlight)
				await gateOpen
				inFlight -= 1
				return { spoke: true, provider: ProviderKind.CLAUDE_CODE }
			}
			protected override async runThreadTurn(): Promise<TurnReport> {
				threadStarted = true
				return { spoke: true, provider: ProviderKind.CLAUDE_CODE }
			}
		}
		const dispatcher = new HeldDispatcher(
			testBed.resolve(MailboxRepository),
			testBed.resolve(ThreadRepository),
			testBed.resolve(WorkspaceRepository),
			testBed.resolve(AgentSessionRepository),
			testBed.resolve(LoggingService),
			testBed.resolve(CloudSession),
			testBed.resolve(IssueHold),
			testBed.resolve(IssueTurnAborter),
			testBed.resolve(CommandQueue),
			gate,
			testBed.resolve(IssueAttributesRepository),
		).bind(testContainer)

		const mailbox = testBed.resolve(MailboxRepository)
		for (let n = 0; n < 5; n++) {
			const issueId = uuidv7()
			await mailbox.enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.ISSUE,
				targetId: issueId,
				kind: MailboxItemKind.WORK,
				claimClass: MailboxClaimClass.WORK,
				posture: PermissionPosture.AUTO,
				payload: { threadId: uuidv7(), key: `APP-${n}`, title: 'slots', goal: 'x' },
				dedupKey: `work:${issueId}`,
			})
		}

		dispatcher.start()
		try {
			expect(await until(() => inFlight === 4, 2_000)).toBe(true)
			await mailbox.enqueue({
				ownerId: MOCK_CLOUD_OWNER_ID,
				targetKind: MailboxTargetKind.THREAD,
				targetId: uuidv7(),
				kind: MailboxItemKind.OPERATOR_MESSAGE,
				claimClass: MailboxClaimClass.OPERATOR,
				posture: PermissionPosture.AUTO,
				payload: { entryId: uuidv7() },
				dedupKey: 'slots-thread-message',
			})
			expect(await until(() => threadStarted, 2_000)).toBe(true)
			expect(peak).toBe(4)
			expect(status.current()?.slots).toMatchObject({ max: 6, effective: 4, limitedBy: SlotLimit.MACHINE })
		} finally {
			release()
			await dispatcher.stop()
		}
	})
})
