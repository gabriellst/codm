import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getSessionChat, sendArtifact } from '@codm/client-typescript/typescript'
import { test, expect } from '../utils/test'
import { givenArtifact, givenAttachedThread, givenFreshUser, injectInboundMessage, readChannelSender } from '../utils/given'

/** A 1×1 transparent PNG — enough for `SendArtifact` (which only `stat()`s the file and copies its
 *  bytes through the mocked `MediaStore`) without decoding anywhere in this spec. */
const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function writeSampleImage(dir: string, fileName = 'preview.png'): string {
	const path = join(dir, fileName)
	writeFileSync(path, Buffer.from(PNG_1X1_BASE64, 'base64'))
	return path
}

/**
 * "Envio de artefatos pelo canal" (`.specs/2026-08-25-envio-de-artefatos-pelo-canal-design.md`,
 * decisions 1/2/4/8, AC-2/AC-3/AC-7) — molded on `13-thinking-indicator.spec.ts` (the
 * `readChannelSender`/`injectInboundMessage` seams onto the in-process `MockChannelSender`) and
 * `91-demo-thread-artifacts.spec.ts` (driving `RecordArtifact`/`GetSessionChat` straight through the
 * real SDK, no UI needed to prove the backend contract).
 *
 * ### Why this calls `SendArtifact` directly instead of routing through an agent run
 * `SendArtifact` is `mcp__codm__SendArtifact` — a tool an agent's run calls, always after
 * `RecordArtifact` (design decision 2/7). Driving that through a REAL run would mean growing
 * `E2eMcpDriver.declareIssueWorkComplete` (agent/mcp/E2eMcpDriver.ts) to also declare a `SendArtifact`
 * call — a shared fixture several OTHER specs (04/09/10/13) assert exact tool sequences against. This
 * spec instead calls the exact same production door (`POST /threads/:threadId/artifacts/:artifactId/
 * send`) the generated MCP tool calls, through the real SDK — everything between the endpoint and the
 * channel (`SendArtifact` → `MediaStore.stage` → `deliver_channel_attachment` command → `CommandQueue`
 * → `DeliverChannelAttachment` → `ChannelSender.sendMedia` → the ledger claim → the `SYSTEM` transcript
 * entry) is the REAL path a tool call would have taken; only the "a model decided to call the tool" leg
 * is skipped, exactly as `91-demo-thread-artifacts.spec.ts` skips the model to call `RecordArtifact`/
 * `sendDirectMessage`/`createIssue` directly.
 *
 * ### There is no Go gateway in this harness — `sendImage` is observed on the MOCK, not `overlay.go`
 * `thread/registry.ts` binds `ChannelSender` to `MockChannelSender` under `e2e` (mirrors `integration`)
 * — the Playwright harness boots ONLY the TS daemon (see `gateway.ts`'s own docblock). So there is no
 * `whatsmeow` client and no `overlay.go` scenario to observe a real `sendImage` HTTP call on; the
 * closest equivalent this environment can assert is `MockChannelSender.sentMedia`, read through
 * `readChannelSender` (extended this task to expose it — T7). `MediaStore` is ALSO mocked
 * (`MockMediaStore`, e2e mirrors `integration`) — deterministic path `/mock-media-dir/<sha256>`, no
 * real write under `CODM_DATA_DIR` — so `mediaPath` is asserted against that prefix, not a real dir.
 *
 * ### AC-3 (the claim, proven without a real WhatsApp echo)
 * A real WhatsApp echo is the gateway redelivering the SAME platform message id this account just
 * sent, as an inbound event. This spec reproduces exactly that shape through the write half of the
 * SAME test seam 13-thinking-indicator's spec uses (`injectInboundMessage`, extended this task with a
 * `fromMe` flag) — same `channelId`, same `messageId` `DeliverChannelAttachment` claimed. The actual
 * guard is `ConsumeInboundMessage`'s dedup latch on `(channelId, platformMessageId)`, which fires
 * regardless of `fromMe`; `fromMe: true` here documents the SCENARIO being simulated (this account's
 * own echo) rather than changing which code path gets exercised.
 */
test('SendArtifact delivers an IMAGE as native media, claims its own echo, and lands as an artifact bubble in the thread', async () => {
	test.setTimeout(45_000)

	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session)
	const scratch = mkdtempSync(join(tmpdir(), 'codm-e2e-send-artifact-'))
	const imagePath = writeSampleImage(scratch)

	const artifactId = await givenArtifact(user.session, {
		threadId: thread.threadId,
		kind: 'IMAGE',
		name: 'preview.png',
		ref: imagePath,
		meta: '',
	})

	const caption = 'Segue o print do preview.'
	await sendArtifact(thread.threadId, artifactId, { caption }, { client: user.session.client })

	const conversation = { channelId: thread.channelId, remoteId: thread.contactExternalId }

	// AC-2/AC-5 — the delivery command is async (`CommandQueue`, same 1s floor
	// `13-thinking-indicator.spec.ts` budgets for), so this polls rather than reading once.
	await expect
		.poll(async () => (await readChannelSender(user.session, conversation)).sentMedia.length, {
			timeout: 20_000,
			message: 'sendMedia was never observed on the mocked channel sender — SendArtifact never delivered',
		})
		.toBeGreaterThan(0)

	const snapshot = await readChannelSender(user.session, conversation)
	expect(snapshot.sentMedia).toHaveLength(1)
	const media = snapshot.sentMedia[0]!
	expect(media.kind).toBe('IMAGE')
	// `MockMediaStore.stage()`'s own deterministic shape (see docblock) — this harness has no real
	// `CODM_DATA_DIR`/media dir to assert a real path under.
	expect(media.mediaPath.startsWith('/mock-media-dir/')).toBe(true)
	expect(media.caption).toBe(caption)

	// AC-2/AC-7 — the SYSTEM entry `DeliverChannelAttachment` wrote carries THIS artifact, visible
	// through the SAME `GetSessionChat` read the console's `SessionChatSection`/`TranscriptBubble` use
	// (T7 — the DTO now joins `artifactId` → kind/name/ref/meta onto the entry that delivered it).
	await expect
		.poll(
			async () => {
				const chat = await getSessionChat(thread.threadId, { client: user.session.client })
				return chat.transcript.some(e => e.artifact?.artifactId === artifactId)
			},
			{ timeout: 20_000, message: 'no SYSTEM entry carrying the delivered artifact ever landed on the thread' },
		)
		.toBe(true)

	const settledBefore = await getSessionChat(thread.threadId, { client: user.session.client })
	const deliveredEntry = settledBefore.transcript.find(e => e.artifact?.artifactId === artifactId)
	expect(deliveredEntry?.kind).toBe('SYSTEM')
	expect(deliveredEntry?.text).toBe(caption)
	expect(deliveredEntry?.artifact).toMatchObject({ artifactId, kind: 'IMAGE', name: 'preview.png', ref: imagePath })

	// AC-3 — this account's own echo of `media.messageId` must produce ZERO new entries (CONTACT or
	// otherwise): the ledger claim `DeliverChannelAttachment` made before writing the entry above is
	// what makes `ConsumeInboundMessage`'s dedup latch swallow the redelivery (see docblock).
	await injectInboundMessage(user.session, {
		channelId: thread.channelId,
		contactExternalId: thread.contactExternalId,
		senderExternalId: thread.contactExternalId,
		messageId: media.messageId,
		fromMe: true,
		text: 'echo of the artifact send — must never become an entry',
	})

	// A window wide enough for the outbox/mailbox dispatchers to have picked the echo up had it NOT
	// been deduped (same budget class as the "Pensando" cessation check in 13-thinking-indicator).
	await new Promise(resolve => setTimeout(resolve, 4_000))

	const settledAfter = await getSessionChat(thread.threadId, { client: user.session.client })
	expect(
		settledAfter.transcript.map(e => e.entryId),
		'the echo produced a new transcript entry — the messageId claim did not dedup it (AC-3)',
	).toEqual(settledBefore.transcript.map(e => e.entryId))
	expect(settledAfter.transcript.some(e => e.kind === 'CONTACT')).toBe(false)
})
