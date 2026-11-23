import { injectable } from 'tsyringe-neo'
import { IssueArtifactReader, type IssueArtifactFile } from './IssueArtifactReader'

/** No artifact table in `mock`: a test that needs a preview seeds it here. */
@injectable()
export class MockIssueArtifactReader extends IssueArtifactReader {
	readonly rows = new Map<string, IssueArtifactFile>()

	async find(artifactId: string): Promise<IssueArtifactFile | undefined> {
		return this.rows.get(artifactId)
	}
}
