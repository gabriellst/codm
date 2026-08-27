import { injectable } from 'tsyringe-neo'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { agentMailbox, issues, outbox } from '@codm/contracts/db'
import { IssueStatus, MailboxTargetKind } from '@codm/contracts-typescript/wire/enums'
import type { StalledIssueRef } from './StalledIssueReader'
import { StalledIssueReader } from './StalledIssueReader'

@injectable()
export class LibSqlStalledIssueReader extends StalledIssueReader {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	/**
	 * SEM `tryCatchAsync`, e a assimetria com `OpenIssuesReader.openIssues` é deliberada — a mesma razão
	 * que `hasWorkingIssue` documenta do outro lado.
	 *
	 * Degradar para "nenhuma órfã" num erro de leitura é indistinguível de "está tudo bem", e o efeito é
	 * a varredura ficar verde para sempre enquanto issues se acumulam mentindo. Um reconciliador que não
	 * consegue ler tem de falhar ALTO: o job repete em um minuto e o erro aparece.
	 */
	async stalledIssues(): Promise<StalledIssueRef[]> {
		const inFlightMailbox = this.driver.db
			.select({ one: sql`1` })
			.from(agentMailbox)
			.where(
				and(
					eq(agentMailbox.targetKind, MailboxTargetKind.ISSUE),
					eq(agentMailbox.targetId, issues.id),
					isNull(agentMailbox.consumedAt),
					isNull(agentMailbox.deadAt),
				),
			)

		const pendingOutbox = this.driver.db
			.select({ one: sql`1` })
			.from(outbox)
			.where(and(eq(outbox.entityId, issues.id), isNull(outbox.processedAt)))

		const rows = await this.driver.db
			.select({ issueId: issues.id, ownerId: issues.ownerId, threadId: issues.threadId })
			.from(issues)
			.where(
				and(
					eq(issues.status, IssueStatus.WORKING),
					eq(issues.archived, false),
					sql`NOT EXISTS ${inFlightMailbox}`,
					sql`NOT EXISTS ${pendingOutbox}`,
				),
			)

		return rows satisfies StalledIssueRef[]
	}
}
