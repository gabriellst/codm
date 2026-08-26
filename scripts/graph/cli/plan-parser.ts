export type PlanCheck = {
	text: string
	done: boolean
}

export type PlanStep = {
	id: string
	title: string
	body: string
	checks: PlanCheck[]
}

export type PlanTaskStatus = 'pending' | 'done'

export type PlanTask = {
	id: string
	name: string
	status: PlanTaskStatus
	agent: string
	reviewer: string
	skills: string[]
	filesWrites: string[]
	filesReads: string[]
	dependsOn: string[]
	// The load-bearing handoff to the fresh-context worker /build dispatches for this Task.
	// `consumes` = EXACT frozen identifiers it imports verbatim; `scopeFence` = DONE/OUT
	// boundaries; `gate` = the close-out command(s). Empty on a dispatched (non-Phase-0) Task
	// is a plan defect — a fresh worker with no handoff re-derives and drops the tail.
	consumes: string
	scopeFence: string
	gate: string
	steps: PlanStep[]
}

export type PlanAST = {
	title: string
	goal: string
	specPath: string
	tasks: PlanTask[]
	finalValidation: string[]
}

const TASK_HEADING = /^## Task (T\d+[a-z]?)(?::\s*(.*))?$/
const STEP_HEADING = /^### Step (T\d+[a-z]?\.\d+)(?:\s*[—-]\s*(.*?))?(?:\s*\(.*\))?\s*$/
const BULLET_LINE = /^\s*-\s+(.*)$/
const STEP_BULLET = /^\s*-\s+\[( |x|X)\]\s+(.*)$/
const FINAL_VALIDATION_HEADING = /^## Final Validation\s*$/
const TOP_HEADING = /^# (.*)$/
const STATUS_DONE = /^(?:done|✅\s*done.*|completed)$/i

type Section = {
	id: string
	taskNameRaw: string
	lines: string[]
}

export function parsePlan(raw: string): PlanAST {
	const lines = raw.split('\n')
	const title = extractTitle(lines)
	const goal = extractFieldFromLines(lines, 'Goal')
	const specPath = extractFieldFromLines(lines, 'Spec')
	const taskSections = splitTaskSections(lines)
	const tasks = taskSections.map(section => parseTaskSection(section))
	const finalValidation = extractFinalValidation(lines)
	return { title, goal, specPath, tasks, finalValidation }
}

function extractTitle(lines: string[]): string {
	for (const line of lines) {
		const match = TOP_HEADING.exec(line)
		if (match) return stripTrailingDecorations(match[1] ?? '')
	}
	return ''
}

function extractFieldFromLines(lines: string[], field: string): string {
	const prefix = `**${field}:**`
	for (const line of lines) {
		if (line.startsWith(prefix)) {
			return line.slice(prefix.length).trim()
		}
	}
	return ''
}

function splitTaskSections(lines: string[]): Section[] {
	const sections: Section[] = []
	let current: Section | null = null
	for (const line of lines) {
		const taskMatch = TASK_HEADING.exec(line)
		if (taskMatch) {
			if (current) sections.push(current)
			current = {
				id: taskMatch[1]!,
				taskNameRaw: taskMatch[2] ?? '',
				lines: [],
			}
			continue
		}
		if (FINAL_VALIDATION_HEADING.test(line)) {
			if (current) {
				sections.push(current)
				current = null
			}
			continue
		}
		if (current) current.lines.push(line)
	}
	if (current) sections.push(current)
	return sections
}

function parseTaskSection(section: Section): PlanTask {
	const { id, taskNameRaw, lines } = section
	const stepBoundaryIdx = lines.findIndex(line => STEP_HEADING.test(line))
	const headerLines = stepBoundaryIdx === -1 ? lines : lines.slice(0, stepBoundaryIdx)
	const stepLines = stepBoundaryIdx === -1 ? [] : lines.slice(stepBoundaryIdx)

	const name = stripTrailingDecorations(taskNameRaw)
	const isDoneFromTitle = /\(DONE\)\s*$/i.test(taskNameRaw)
	const statusFromBody = parseStatus(headerLines)
	const status: PlanTaskStatus = isDoneFromTitle || statusFromBody === 'done' ? 'done' : 'pending'

	const agent = stripParenAnnotations(parseInlineField(headerLines, 'Agent'))
	const reviewer = stripParenAnnotations(parseInlineField(headerLines, 'Reviewer'))
	const skills = parseListField(headerLines, 'Skills')
	const dependsOn = parseDependsOn(parseInlineField(headerLines, 'Depends on'))
	const filesWrites = parseFilesList(headerLines, 'Files to write')
	const filesReads = parseFilesList(headerLines, 'Files to read')
	const consumes = parseInlineField(headerLines, 'Consumes (frozen)')
	const scopeFence = parseInlineField(headerLines, 'Scope fence')
	const gate = parseInlineField(headerLines, 'Gate')
	const steps = parseSteps(stepLines)

	return {
		id,
		name,
		status,
		agent,
		reviewer,
		skills,
		filesWrites,
		filesReads,
		dependsOn,
		consumes,
		scopeFence,
		gate,
		steps,
	}
}

function parseStatus(lines: string[]): PlanTaskStatus | null {
	const raw = parseInlineField(lines, 'Status')
	if (!raw) return null
	const cleaned = raw
		.replace(/`[^`]*`/g, '')
		.replace(/\(.*?\)/g, '')
		.trim()
	if (STATUS_DONE.test(cleaned)) return 'done'
	return 'pending'
}

function parseInlineField(lines: string[], field: string): string {
	const prefix = `**${field}:**`
	for (const line of lines) {
		if (line.startsWith(prefix)) {
			return line.slice(prefix.length).trim()
		}
	}
	return ''
}

function parseListField(lines: string[], field: string): string[] {
	const raw = parseInlineField(lines, field)
	if (!raw) return []
	if (isNoneValue(raw)) return []
	return raw
		.split(',')
		.map(token => token.trim())
		.filter(token => token.length > 0)
}

function parseDependsOn(raw: string): string[] {
	if (!raw) return []
	if (isNoneValue(raw)) return []
	const matches = raw.match(/T\d+[a-z]?/g)
	return matches ? Array.from(new Set(matches)) : []
}

function parseFilesList(lines: string[], field: string): string[] {
	const fieldHeader = `**${field}:**`
	const idx = lines.findIndex(line => line.startsWith(fieldHeader))
	if (idx === -1) return []
	const inline = lines[idx]!.slice(fieldHeader.length).trim()
	const items: string[] = []
	if (inline.length > 0 && !isNoneValue(inline)) {
		const value = extractBacktickValue(inline) ?? inline
		items.push(value)
	}
	for (let i = idx + 1; i < lines.length; i++) {
		const line = lines[i]!
		if (line.trim() === '') {
			if (items.length > 0) break
			continue
		}
		const bulletMatch = BULLET_LINE.exec(line)
		if (!bulletMatch) break
		const value = extractBacktickValue(bulletMatch[1] ?? '') ?? (bulletMatch[1] ?? '').trim()
		if (value.length > 0) items.push(value)
	}
	return items
}

function parseSteps(lines: string[]): PlanStep[] {
	const steps: PlanStep[] = []
	let current: { id: string; title: string; bodyLines: string[]; checks: PlanCheck[] } | null = null

	const flush = () => {
		if (!current) return
		steps.push({
			id: current.id,
			title: current.title,
			body: current.bodyLines.join('\n').trim(),
			checks: current.checks,
		})
		current = null
	}

	for (const line of lines) {
		const stepMatch = STEP_HEADING.exec(line)
		if (stepMatch) {
			flush()
			current = {
				id: stepMatch[1]!,
				title: (stepMatch[2] ?? '').trim(),
				bodyLines: [],
				checks: [],
			}
			continue
		}
		if (!current) continue
		current.bodyLines.push(line)
		const bulletMatch = STEP_BULLET.exec(line)
		if (bulletMatch) {
			const marker = bulletMatch[1] ?? ' '
			const text = (bulletMatch[2] ?? '').trim()
			if (text.length > 0) {
				current.checks.push({
					text,
					done: marker === 'x' || marker === 'X',
				})
			}
		}
	}
	flush()
	return steps
}

function extractFinalValidation(lines: string[]): string[] {
	const startIdx = lines.findIndex(line => FINAL_VALIDATION_HEADING.test(line))
	if (startIdx === -1) return []
	const items: string[] = []
	for (let i = startIdx + 1; i < lines.length; i++) {
		const line = lines[i]!
		if (line.startsWith('## ')) break
		const bulletMatch = STEP_BULLET.exec(line)
		if (bulletMatch) {
			const text = (bulletMatch[2] ?? '').trim()
			if (text.length > 0) items.push(text)
		}
	}
	return items
}

function extractBacktickValue(token: string): string | null {
	const match = /`([^`]+)`/.exec(token)
	return match ? match[1]! : null
}

function isNoneValue(raw: string): boolean {
	const normalized = raw.trim().toLowerCase()
	if (normalized.length === 0) return true
	if (normalized === 'none') return true
	return normalized.startsWith('(none')
}

function stripTrailingDecorations(value: string): string {
	return value.replace(/\s*\(DONE\)\s*$/i, '').trim()
}

function stripParenAnnotations(value: string): string {
	return value.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
}
