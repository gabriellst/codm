import { describe, expect, it } from 'bun:test'
import { ArtifactKind, StopKind } from '@codedm/contracts-typescript/wire/enums'
import { AgentToolName } from '../../enums'
import { AGENT_TOOL_INPUT_SCHEMAS } from './schemas'

/**
 * AC-1.6 — the SECURITY invariant of the MCP surface, asserted mechanically.
 *
 * Identity comes from the run token and from nowhere else. A tool input schema that accepted an
 * `ownerId` would let a model — or a prompt injected into a repository the agent is reading — declare
 * an issue complete on behalf of a different owner. The check iterates the registry rather than a
 * hand-written list, so a fifth tool is covered the day it is added.
 */

/** Every field name that identifies WHO or WHAT the run is about. None may appear in a tool payload. */
const IDENTITY_KEYS = ['ownerId', 'issueId', 'threadId'] as const

describe('AC-1.6 — no MCP tool input schema carries an identity field', () => {
	it('covers all four tools, keyed by AgentToolName', () => {
		expect(Object.keys(AGENT_TOOL_INPUT_SCHEMAS).sort()).toEqual([...Object.values(AgentToolName)].sort())
		expect(Object.keys(AGENT_TOOL_INPUT_SCHEMAS)).toHaveLength(4)
	})

	it.each(Object.entries(AGENT_TOOL_INPUT_SCHEMAS))('%s declares no ownerId / issueId / threadId', (_tool, schema) => {
		const keys = Object.keys(schema.shape)
		for (const forbidden of IDENTITY_KEYS) expect(keys).not.toContain(forbidden)
	})

	it('rejects an identity field smuggled in at runtime, not just at the type level', () => {
		// The schemas are `z.object` (strip mode): an extra key is DROPPED, never forwarded. So even a
		// model that invents `{ summary, ownerId }` cannot get an ownerId to the handler.
		const parsed = AGENT_TOOL_INPUT_SCHEMAS[AgentToolName.COMPLETE_ISSUE].parse({
			summary: 'done',
			ownerId: '00000000-0000-4000-8000-000000000000',
		})
		expect(parsed).toEqual({ summary: 'done' })
		expect('ownerId' in parsed).toBe(false)
	})
})

describe('the four tool payloads land on already-frozen vocabulary', () => {
	it('complete_issue takes a non-empty summary', () => {
		expect(AGENT_TOOL_INPUT_SCHEMAS[AgentToolName.COMPLETE_ISSUE].safeParse({ summary: 'shipped it' }).success).toBe(true)
		expect(AGENT_TOOL_INPUT_SCHEMAS[AgentToolName.COMPLETE_ISSUE].safeParse({ summary: '   ' }).success).toBe(false)
	})

	it('raise_stop takes the FROZEN StopKind — not a redeclared value-set', () => {
		const schema = AGENT_TOOL_INPUT_SCHEMAS[AgentToolName.RAISE_STOP]
		expect(schema.safeParse({ kind: StopKind.APPROVAL_NEEDED, detail: 'needs a prod deploy approval' }).success).toBe(true)
		expect(schema.safeParse({ kind: 'MADE_UP', detail: 'x' }).success).toBe(false)
		// detail is REQUIRED: without it the "Needs you" card renders empty, which is exactly the gap
		// the additive `detail` field on issue-stop-raised.tsp closes in Fase 6.
		expect(schema.safeParse({ kind: StopKind.APPROVAL_NEEDED }).success).toBe(false)
	})

	it('record_artifact mirrors the RecordArtifact use case minus identity — ref and meta survive', () => {
		const schema = AGENT_TOOL_INPUT_SCHEMAS[AgentToolName.RECORD_ARTIFACT]
		expect(schema.safeParse({ kind: ArtifactKind.LINK, name: 'preview', ref: 'https://preview.example' }).success).toBe(true)
		expect(Object.keys(schema.shape).sort()).toEqual(['kind', 'meta', 'name', 'ref'])
	})

	it('ask_operator takes only a question — the handler, not the model, fixes the StopKind', () => {
		const schema = AGENT_TOOL_INPUT_SCHEMAS[AgentToolName.ASK_OPERATOR]
		expect(Object.keys(schema.shape)).toEqual(['question'])
		expect(schema.safeParse({ question: 'which staging DB should I point at?' }).success).toBe(true)
		// No `kind` field: ask_operator is typed sugar over the same landing as raise_stop, with
		// HUMAN_REQUESTED fixed by the handler.
		expect(Object.keys(schema.shape)).not.toContain('kind')
	})
})

describe('the codedm__ prefix is load-bearing', () => {
	it('every tool name carries it — the accumulator anti-double-publish guard keys on the prefix', () => {
		for (const name of Object.values(AgentToolName)) expect(name.startsWith('codedm__')).toBe(true)
	})
})
