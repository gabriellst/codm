import { injectable } from 'tsyringe-neo'
import { GroupMemberReader, type GroupMember } from './GroupMemberReader'

/** Test double — no group members by default. Tests exercising group hydration override with a stub. */
@injectable()
export class MockGroupMemberReader extends GroupMemberReader {
	async listMembers(_channelId: string, _groupId: string): Promise<GroupMember[]> {
		return []
	}

	async isMember(_channelId: string, _groupId: string, _memberId: string): Promise<boolean> {
		return false
	}
}
