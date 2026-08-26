import type { ContextDecl } from '@codm/contracts/context'

export default {
	/** Trabalho LOCAL: desktop, SQLite compartilhado com o sidecar Go. */
	placement: [{ when: { deployment: 'local' }, infra: { db: 'libsql' } }],

	kind: 'domain',
	consumes: {
		thread:
			'RecordArtifact validates the target thread exists via ThreadRepository (the artifact catalog is a sink, not the owner). SendArtifact ("envio de artefatos pelo canal" design) extends this: ThreadRepository resolves channelId/contactExternalId for the LINK text path, ChannelSender reads capabilities.media (services surface), and the enqueue of both delivery commands (deliver_channel_message for LINK, deliver_channel_attachment for media) crosses through thread/services/ArtifactDelivery — a free-function ignition seam, same shape as beginTypingPresence, because CROSS_CONTEXT_POLICY forbids importing thread/usecases directly.',
		issue: 'RecordArtifact validates the optional issue exists via IssueRepository (same sink posture).',
	},
} satisfies ContextDecl
