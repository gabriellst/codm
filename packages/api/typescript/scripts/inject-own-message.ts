/**
 * Runtime acceptance probe for the OWN-MESSAGE path (task #20, Phase A + B).
 *
 * Simulates the one thing a test suite cannot: the owner typing in their own WhatsApp group. The Go
 * gateway would raise `channel.message_sent` and `MessageSentHandler` would bridge it inbound with
 * `fromMe: true` — this writes the outbox row that bridge produces, into the DESKTOP store, so the
 * live daemon picks it up through its real mediator.
 *
 * Built with the FROZEN event class rather than hand-written JSON: the outbox payload is a serialized
 * `BaseEvent` envelope, and guessing its shape would invent a second contract.
 *
 * # What it proved, 28-jul-2026 19:02 (keep this — it is the record)
 *
 * Injected "qual comando roda os testes do backend?" as a from-me message. The chain ran end to end
 * against the real CLI: transcript entry attributed to `operator` (not the phone JID the group roster
 * mutes), classification, issue `qual-comando-roda-os-testes-do-backend` materialized COMPLETED, and
 * `channel.message_sent` at 19:02:06 carrying the answer — the reply ACTUALLY reached WhatsApp. The
 * loop break held: the outgoing id `3EB0DDFC67D81A941CFA1D` was written to `thread_consumed_messages`
 * and its echo produced ZERO transcript entries.
 *
 * # The vacuous check to not repeat
 *
 * `integration.channel.delivery_requested` NÃO EXISTE MAIS (B3): a entrega é o comando
 * `deliver_channel_message` em `shared_scheduled_commands`. E desde B3 todo integration event
 * publicado pelo TS SIM cai no `shared_outbox`, na lane `integration` — `publish()` persiste. Para
 * observar a entrega, olhe a fila de comandos; para observar um fato cruzando, olhe a lane.
 */
import { Database } from 'bun:sqlite'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ChannelMessageReceivedInProcessEvent } from '@codm/contracts-typescript/wire/events'
import { ChannelKind, MessageAuthor, MessageType } from '@codm/contracts-typescript/wire/enums'

const DB = join(homedir(), 'Library', 'Application Support', 'app.codm.desktop', 'data', 'codm.db')
const OWNER = '00000000-0000-4000-8000-000000000001'
const CHANNEL = '1158f5b6-843b-4b60-8d12-3e4550a35f5c'
const GROUP = '558388287518-1575856528@g.us'
const OWNER_JID = '558388287518@s.whatsapp.net'

const text = process.argv[2] ?? 'qual comando roda os testes do backend?'
const messageId = `probe-${Date.now()}`

const event = new ChannelMessageReceivedInProcessEvent({
	ownerId: OWNER,
	payload: {
		channelId: CHANNEL,
		messageId,
		internalMessageId: crypto.randomUUID(),
		remoteId: GROUP,
		senderId: OWNER_JID,
		// THE TWO FACTS THAT MAKE THIS THE OWNER'S OWN MESSAGE.
		fromMe: true,
		author: MessageAuthor.HUMAN,
		isGroup: true,
		timestamp: Math.floor(Date.now() / 1000),
		occurredAt: new Date(),
		observedAt: new Date(),
		messageType: MessageType.TEXT,
		content: { text },
		platform: ChannelKind.WHATSAPP,
	},
})

const db = new Database(DB)
db.query(
	`INSERT INTO shared_outbox (id, name, entity_id, owner_id, payload, source, attempts, created_at)
	 VALUES (?, ?, NULL, ?, ?, 'integration', 0, ?)`,
).run(crypto.randomUUID(), ChannelMessageReceivedInProcessEvent.name, OWNER, JSON.stringify(event.toJSON()), Date.now())
db.close()

console.log(`injected messageId=${messageId} text=${JSON.stringify(text)}`)
