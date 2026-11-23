import { injectable } from 'tsyringe-neo'
import { SupervisorVerdict } from '@codm/contracts-typescript/wire/enums'
import { IssueSupervisor, type SupervisorDecision, type SupervisorSubject } from './IssueSupervisor'

/**
 * The supervisor of the test environments: no model. Answers `LEAVE` unless a test scripts the decision for an issue,
 * and keeps every subject it was handed so a suite can assert what the job showed it.
 */
@injectable()
export class MockIssueSupervisor extends IssueSupervisor {
	readonly reviewed: SupervisorSubject[] = []
	private readonly scripted = new Map<string, SupervisorDecision>()

	script(issueId: string, decision: SupervisorDecision): void {
		this.scripted.set(issueId, decision)
	}

	async review(subject: SupervisorSubject): Promise<SupervisorDecision> {
		this.reviewed.push(subject)
		return this.scripted.get(subject.suspect.issueId) ?? { verdict: SupervisorVerdict.LEAVE }
	}
}
