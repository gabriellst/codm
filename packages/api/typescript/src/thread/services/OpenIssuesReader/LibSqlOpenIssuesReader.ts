import { injectable } from 'tsyringe-neo'
import { and, eq, ne } from 'drizzle-orm'
import { LibSqlDatabaseDriver, tryCatchAsync } from '@codm/core-typescript'
import { issues, transcriptEntries } from '@codm/contracts/db'
import { IssueStatus } from '@codm/contracts-typescript/wire/enums'
import type { OpenIssueRef, SteerableIssueRef } from './OpenIssuesReader'
import { OpenIssuesReader } from './OpenIssuesReader'

@injectable()
export class LibSqlOpenIssuesReader extends OpenIssuesReader {
	constructor(private driver: LibSqlDatabaseDriver) {
		super()
	}

	async openIssues(threadId: string): Promise<OpenIssueRef[]> {
		const result = await tryCatchAsync(async () =>
			this.driver.db
				.select({ issueId: issues.id, key: issues.key, title: issues.title })
				.from(issues)
				.where(and(eq(issues.threadId, threadId), eq(issues.archived, false), ne(issues.status, IssueStatus.COMPLETED))),
		)
		return result.success ? result.data : []
	}

	/**
	 * NO `tryCatchAsync`, unlike its two siblings — and the asymmetry is the point.
	 *
	 * `openIssues` and `issueIdForEntry` feed a CLASSIFIER: degrading to "no candidates" on a read error
	 * costs a context match and the message still lands. This one feeds a GUARD on a destructive action,
	 * where the same posture reads "I could not check, so go ahead and delete it" — a read failure would
	 * silently authorise the exact thing decision 2 exists to refuse. A guard that cannot read must fail
	 * CLOSED, and the honest way to fail closed is to let the error out.
	 */
	async hasWorkingIssue(threadId: string): Promise<boolean> {
		const rows = await this.driver.db
			.select({ id: issues.id })
			.from(issues)
			.where(and(eq(issues.threadId, threadId), eq(issues.status, IssueStatus.WORKING), eq(issues.archived, false)))
			.limit(1)
		return rows.length > 0
	}

	async issueIdForEntry(entryId: string): Promise<string | undefined> {
		const result = await tryCatchAsync(async () => {
			const rows = await this.driver.db
				.select({ issueId: transcriptEntries.issueId })
				.from(transcriptEntries)
				.where(eq(transcriptEntries.id, entryId))
				.limit(1)
			return rows[0]?.issueId ?? undefined
		})
		return result.success ? (result.data ?? undefined) : undefined
	}

	/**
	 * SEM `tryCatchAsync`, pela mesma razão que `hasWorkingIssue`: isto alimenta um GUARD de
	 * autorização, não um classificador. Degradar para `undefined` num erro de leitura diria "não
	 * consegui verificar, então recuse" — o que parece seguro mas transforma qualquer soluço do banco
	 * numa recusa silenciosa que o operador leria como "o agente me ignorou de novo". Deixar o erro
	 * sair é a forma honesta de falhar.
	 */
	async steerableIssue(threadId: string, issueId: string): Promise<SteerableIssueRef | undefined> {
		const rows = await this.driver.db
			.select({ issueId: issues.id, key: issues.key, title: issues.title, status: issues.status })
			.from(issues)
			.where(and(eq(issues.threadId, threadId), eq(issues.id, issueId), eq(issues.archived, false)))
			.limit(1)
		const row = rows[0]
		if (!row) return undefined
		return { issueId: row.issueId, key: row.key, title: row.title, needsReopen: row.status !== IssueStatus.WORKING }
	}
}
