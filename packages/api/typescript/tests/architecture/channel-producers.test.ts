import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Channel-producers guard (fase 3, "emagrecer o grupo") — every path by which something reaches the
 * WhatsApp group is DECLARED here, with the reason it may speak.
 *
 * The output policy (`thread/utils/OutputPolicy.ts`) only works if what an issue says goes THROUGH it. A new
 * file that enqueues `deliver_channel_message` / `deliver_channel_attachment` on its own is a leak: an issue
 * talking to the group without asking the group's mode. So the set of producers is a declared list, and a
 * producer outside it fails here until somebody writes down why it may speak (policy / the orchestrator's
 * voice / the operator / an echo).
 *
 * A producer is a production file that names one of the two commands as a string literal anywhere other
 * than the consumer's own `readonly name = '…'` declaration, OR that calls the policy's own sending helper
 * (`enqueueSignalDelivery`) — a helper is a door too, and a new file reaching for it to skip the routing
 * must show up here. Derived from the code, not from the spec's count. Out of scope: a direct
 * `ChannelSender` call (the transport port under the delivery commands), which no use case makes.
 */

const API_SRC = join(import.meta.dir, '..', '..', 'src')
const CHANNEL_COMMANDS = ['deliver_channel_message', 'deliver_channel_attachment'] as const
/** The output policy's own sending helper (`thread/utils/issueSignal.ts`). */
const POLICY_SEND = 'enqueueSignalDelivery('

/** The declared producers — path relative to `src/` → why it may put something on the channel. */
const CHANNEL_PRODUCERS: Record<string, string> = {
	'thread/utils/issueSignal.ts': 'POLICY — `enqueueSignalDelivery`, the send of an entry the output policy routed to the group.',
	'thread/usecases/DeliverIssueSignal.ts': "POLICY — the one door of an issue's spontaneous signal (feedback, progress, closing).",
	'thread/usecases/RaiseStop.ts':
		"POLICY — a stop's notice: an issue's stop through `recordIssueSignal`; a conversation's stop keeps today's notice.",
	'thread/usecases/RecordOrchestratorReply.ts':
		"THE ORCHESTRATOR'S VOICE — its reply to whoever spoke, outside the policy by the owner's decision.",
	'thread/usecases/SendDirectMessage.ts': 'THE OPERATOR / THE ORCHESTRATOR — a direct message from the console or an orchestration run.',
	'thread/usecases/NotifyProviderPaused.ts':
		'POLICY — the PROVIDER_LIMIT block notice; asks `ROUTING_BY_MODE[mode][BLOCK_NOTICE]` before sending.',
	'thread/usecases/ExecutePanelAction.ts': 'ECHO — one line per action taken on the cloud panel (fase 2, item 6b).',
	'thread/usecases/IngestChannelMessage.ts':
		'THE RULE LAYER — the ONE "which one?" back to a bare "sim" with several open asks (fase 3, item 3); not an issue speaking.',
	'thread/services/ArtifactDelivery/ArtifactDelivery.ts':
		"THE OPERATOR / THE ORCHESTRATOR — an artifact sent by `SendArtifact` (out of the issue's scope from S5a).",
}

/** The consumer's own declaration of its name — the one place the literal is not a producer. */
const DECLARATION = /readonly\s+name\s*=\s*'(deliver_channel_message|deliver_channel_attachment)'/g

/** Whether a source text sends to the channel: a command literal (not its declaration) or the policy's helper. */
function producesChannelCommand(source: string): boolean {
	const withoutDeclaration = source.replace(DECLARATION, '')
	return withoutDeclaration.includes(POLICY_SEND) || CHANNEL_COMMANDS.some(command => withoutDeclaration.includes(`'${command}'`))
}

function listSourceFiles(dir: string): string[] {
	const out: string[] = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name)
		if (entry.isDirectory()) out.push(...listSourceFiles(full))
		else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
	}
	return out
}

describe('channel producers — every path to the group is declared', () => {
	const producers = listSourceFiles(API_SRC)
		.filter(file => producesChannelCommand(readFileSync(file, 'utf8')))
		.map(file => relative(API_SRC, file))
		.sort()

	test('the scan sees producers at all (a vacuous scan is a broken gate)', () => {
		expect(producers.length).toBeGreaterThan(0)
	})

	test('every producer in the code is declared, with its reason', () => {
		const undeclared = producers.filter(file => !(file in CHANNEL_PRODUCERS))
		expect(undeclared).toEqual([])
	})

	test('every declared producer still produces — the list never outlives the code', () => {
		expect(Object.keys(CHANNEL_PRODUCERS).sort()).toEqual(producers)
	})

	test('NEGATIVE FIXTURE — a new file that enqueues a delivery on its own is caught', () => {
		const leak = `await this.commands.enqueueCommand<DeliverChannelMessage>('deliver_channel_message', payload, {}, tx)`
		expect(producesChannelCommand(leak)).toBe(true)
		expect(producesChannelCommand(`await queue.enqueueCommand('deliver_channel_attachment', p)`)).toBe(true)
		// Reaching for the policy's helper is a door too.
		expect(producesChannelCommand('await enqueueSignalDelivery(this.commands, thread, entry, tx)')).toBe(true)
		// The consumer declaring its own name is not a producer.
		expect(producesChannelCommand(`readonly name = 'deliver_channel_message' as const`)).toBe(false)
	})
})
