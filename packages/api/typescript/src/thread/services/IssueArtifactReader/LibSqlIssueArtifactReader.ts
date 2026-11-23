import { injectable } from 'tsyringe-neo'
import { eq } from 'drizzle-orm'
import { LibSqlDatabaseDriver } from '@codm/core-typescript'
import { artifacts } from '@codm/contracts/db'
import { IssueArtifactReader, type IssueArtifactFile } from './IssueArtifactReader'

@injectable()
export class LibSqlIssueArtifactReader extends IssueArtifactReader {
	constructor(private readonly driver: LibSqlDatabaseDriver) {
		super()
	}

	async find(artifactId: string): Promise<IssueArtifactFile | undefined> {
		const [row] = await this.driver.db
			.select({ artifactId: artifacts.id, issueId: artifacts.issueId, kind: artifacts.kind, ref: artifacts.ref })
			.from(artifacts)
			.where(eq(artifacts.id, artifactId))
		return row ? { artifactId: row.artifactId, issueId: row.issueId ?? undefined, kind: row.kind, ref: row.ref } : undefined
	}
}
