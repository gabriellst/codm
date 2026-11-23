import { injectable } from 'tsyringe-neo'
import { HandoffNotes, type HandoffDigest, type HandoffSubject } from './HandoffNotes'

/** The `mock` environment's derived notes: the title alone, unless a test scripts the digest of an issue. */
@injectable()
export class MockHandoffNotes extends HandoffNotes {
	private readonly scripted = new Map<string, Omit<HandoffDigest, 'title'>>()

	script(issueId: string, digest: Omit<HandoffDigest, 'title'>): void {
		this.scripted.set(issueId, digest)
	}

	async digest(subject: HandoffSubject): Promise<HandoffDigest> {
		const scripted = this.scripted.get(subject.issueId)
		return { answers: [], openQuestions: [], recentMessages: [], artifacts: [], progress: [], ...scripted, title: subject.title }
	}
}
