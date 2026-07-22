/**
 * Spec markdown parser.
 *
 * Parses spec files written under the format defined in
 * `.claude/commands/brainstorm.md` ("## Spec Format" block) into a typed
 * AST consumed by `bun cli graph plan` (Task T2 in
 * .plans/2026-05-13-agentic-coding-system-bootstrap.md).
 *
 * Strategy:
 *   1. Split the document by top-level `## ` headings.
 *   2. Run section-specific regex over each block.
 *
 * The parser is permissive: missing sections produce empty arrays rather
 * than throwing, because /plan is allowed to surface those gaps as
 * inconsistencies rather than crash.
 */

export type SpecStatus = 'Draft' | 'Approved'
export type SpecKind = 'feature' | 'bug' | 'chore' | 'spike'

export type SpecDecision = {
	id: number
	text: string
}

export type SpecComponent = {
	skill?: string
	description: string
	isNew: boolean
}

export type SpecAcceptanceCriterion = {
	id: string
	text: string
}

export type SpecAST = {
	title: string
	status: SpecStatus
	boundedContext: string
	kind: SpecKind
	decisions: SpecDecision[]
	componentsAffected: SpecComponent[]
	acceptanceCriteria: SpecAcceptanceCriterion[]
	openQuestions: string[]
}

const KNOWN_STATUSES: readonly SpecStatus[] = ['Draft', 'Approved'] as const
const KNOWN_KINDS: readonly SpecKind[] = ['feature', 'bug', 'chore', 'spike'] as const

type Section = {
	heading: string
	body: string
}

/**
 * Split a markdown document into `## ` sections. The portion before the
 * first `## ` heading is returned under the empty heading key so callers
 * can still read frontmatter-style metadata (Status, Bounded Context).
 */
function splitSections(raw: string): Map<string, Section> {
	const lines = raw.split('\n')
	const sections = new Map<string, Section>()
	let currentHeading = ''
	let currentBody: string[] = []

	const flush = () => {
		const body = currentBody.join('\n')
		// Last-write wins on duplicate headings (specs should not have them).
		sections.set(currentHeading, { heading: currentHeading, body })
	}

	for (const line of lines) {
		const match = /^##\s+(.+?)\s*$/.exec(line)
		// Skip `### ` and deeper — they belong to the parent `## ` section.
		if (match && !line.startsWith('### ')) {
			flush()
			currentHeading = match[1]!.trim()
			currentBody = []
		} else {
			currentBody.push(line)
		}
	}
	flush()
	return sections
}

/**
 * Extract the title from the first `# ` heading. Falls back to empty.
 */
function parseTitle(raw: string): string {
	for (const line of raw.split('\n')) {
		const match = /^#\s+(.+?)\s*$/.exec(line)
		if (match) return match[1]!.trim()
	}
	return ''
}

/**
 * Read a `**Field:** value` line out of the preamble block (the body of
 * the empty-heading section). Returns empty string if the field is
 * absent.
 */
function parseField(preamble: string, field: string): string {
	const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const re = new RegExp(`^\\*\\*${escaped}:\\*\\*\\s+(.+?)\\s*$`, 'm')
	const match = re.exec(preamble)
	return match ? match[1]!.trim() : ''
}

function parseStatus(value: string): SpecStatus {
	for (const candidate of KNOWN_STATUSES) {
		if (value === candidate) return candidate
	}
	// Default to Draft for unknown / missing — matches brainstorm's "no
	// agent self-approves" invariant.
	return 'Draft'
}

function parseKind(value: string): SpecKind {
	for (const candidate of KNOWN_KINDS) {
		if (value === candidate) return candidate
	}
	return 'feature'
}

/**
 * Parse `^\d+\.` numbered lines from the Decisions section body.
 *
 * Continuation lines (indented or non-empty without a number prefix) are
 * folded into the previous decision so multi-line decisions stay intact.
 */
function parseDecisions(body: string): SpecDecision[] {
	const out: SpecDecision[] = []
	const lines = body.split('\n')
	let current: SpecDecision | null = null

	for (const line of lines) {
		const numbered = /^(\d+)\.\s+(.+?)\s*$/.exec(line)
		if (numbered) {
			if (current) out.push(current)
			current = {
				id: parseInt(numbered[1]!, 10),
				text: numbered[2]!.trim(),
			}
			continue
		}
		// Blank line ends the current decision.
		if (line.trim() === '') {
			if (current) {
				out.push(current)
				current = null
			}
			continue
		}
		// Continuation of an in-progress decision.
		if (current) {
			current.text = `${current.text} ${line.trim()}`.trim()
		}
	}
	if (current) out.push(current)
	return out
}

/**
 * Parse `- ` bullets from the Components Affected section.
 *
 * Bullets matching `- Skill \`/<name>\` — <desc>` (the canonical
 * brainstorm format) populate the `skill` field. All other bullets are
 * captured with `skill: undefined`. The `isNew` flag is true if the
 * bullet text contains "(new)".
 *
 * Indented sub-bullets and `### ` sub-section headings are skipped.
 */
function parseComponents(body: string): SpecComponent[] {
	const out: SpecComponent[] = []
	const skillPattern = /^-\s+Skill\s+`?\/([a-zA-Z0-9_-]+)`?\s*(?:[-—]\s*(.*))?$/
	const plainBullet = /^-\s+(.+?)\s*$/

	for (const rawLine of body.split('\n')) {
		const line = rawLine.replace(/\r$/, '')
		// Only top-level bullets — sub-bullets (indented) are detail, not
		// distinct components.
		if (!line.startsWith('- ')) continue

		const skillMatch = skillPattern.exec(line)
		if (skillMatch) {
			const description = (skillMatch[2] ?? '').trim()
			out.push({
				skill: skillMatch[1]!,
				description,
				isNew: /\(new\)/i.test(description),
			})
			continue
		}

		const plain = plainBullet.exec(line)
		if (plain) {
			const description = plain[1]!.trim()
			out.push({
				description,
				isNew: /\(new\)/i.test(description),
			})
		}
	}
	return out
}

/**
 * Parse `- [ ] AC-<n>` (or `- [x] AC-<n>`) checklist items from the
 * Acceptance Criteria section.
 */
function parseAcceptanceCriteria(body: string): SpecAcceptanceCriterion[] {
	const out: SpecAcceptanceCriterion[] = []
	const re = /^-\s+\[[ xX]\]\s+(AC-\d+)\s*[-—:]?\s*(.*)$/
	for (const rawLine of body.split('\n')) {
		const line = rawLine.replace(/\r$/, '')
		const match = re.exec(line)
		if (!match) continue
		out.push({
			id: match[1]!,
			text: match[2]!.trim(),
		})
	}
	return out
}

/**
 * Parse `- ` bullets out of the Open Questions section. Each bullet
 * becomes a string (with the leading `- ` stripped). Sub-bullets are
 * folded into the parent question with a space separator so the OQ
 * identifier stays attached to its rationale.
 */
function parseOpenQuestions(body: string): string[] {
	const out: string[] = []
	let current: string | null = null
	for (const rawLine of body.split('\n')) {
		const line = rawLine.replace(/\r$/, '')
		const top = /^-\s+(.+?)\s*$/.exec(line)
		if (top) {
			if (current !== null) out.push(current)
			current = top[1]!.trim()
			continue
		}
		if (line.trim() === '') {
			if (current !== null) {
				out.push(current)
				current = null
			}
			continue
		}
		if (current !== null && /^\s+/.test(line)) {
			current = `${current} ${line.trim()}`.trim()
		}
	}
	if (current !== null) out.push(current)
	return out
}

/**
 * Parse a spec markdown document into a typed AST. Missing sections
 * produce empty arrays rather than throwing — surfacing those as
 * inconsistencies is /plan's job, not this parser's.
 */
export function parseSpec(raw: string): SpecAST {
	const sections = splitSections(raw)
	const preamble = sections.get('')?.body ?? ''

	const decisionsBody = sections.get('Decisions')?.body ?? ''
	const componentsBody = sections.get('Components Affected')?.body ?? ''
	const acceptanceBody = sections.get('Acceptance Criteria')?.body ?? ''
	const openQuestionsBody = sections.get('Open Questions')?.body ?? ''

	return {
		title: parseTitle(raw),
		status: parseStatus(parseField(preamble, 'Status')),
		boundedContext: parseField(preamble, 'Bounded Context'),
		kind: parseKind(parseField(preamble, 'Kind')),
		decisions: parseDecisions(decisionsBody),
		componentsAffected: parseComponents(componentsBody),
		acceptanceCriteria: parseAcceptanceCriteria(acceptanceBody),
		openQuestions: parseOpenQuestions(openQuestionsBody),
	}
}
