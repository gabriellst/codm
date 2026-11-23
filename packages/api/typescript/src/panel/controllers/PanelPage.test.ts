import { describe, expect, it } from 'bun:test'
import {
	IssueLifeState,
	IssueTimelineItemKind,
	NudgeSource,
	StopResolution,
	SupervisorVerdict,
	SuspicionReason,
} from '@codm/contracts-typescript/wire/enums'
import { PANEL_HTML } from './PanelPage'

/**
 * THE PANEL PAGE (fase 1; fase 5 S6) — a public page that shows text people wrote in a chat. Two things are checked
 * on its source, since it is one self-contained document with an inline script:
 *  - every value goes in as TEXT: no `innerHTML`, `outerHTML`, `insertAdjacentHTML` nor `document.write` anywhere;
 *  - its label maps are TOTAL over the wire enums they translate, so a new member (fase 5: `WAITING_RETRY`, the three
 *    timeline moments, `AUTO_RETRY`, the supervisor's reasons and verdicts) never shows as a raw code.
 *
 * The maps are one-line object literals of the script; each is read back and evaluated as data.
 */
const script = PANEL_HTML.slice(PANEL_HTML.indexOf('<script>'), PANEL_HTML.indexOf('</script>'))

function mapOf(name: string): Record<string, unknown> {
	const match = script.match(new RegExp(`const ${name} = (\\{[^\\n]*\\});`))
	if (!match?.[1]) throw new Error(`map ${name} not found in the panel script`)
	return new Function(`return (${match[1]})`)() as Record<string, unknown>
}

describe('panel page', () => {
	it('never parses a value as markup', () => {
		for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) expect(PANEL_HTML).not.toContain(sink)
	})

	it.each([
		['COLUMN_OF', Object.values(IssueLifeState)],
		['KIND', Object.values(IssueTimelineItemKind)],
		['RESOLUTION', Object.values(StopResolution)],
		['NUDGER', Object.values(NudgeSource)],
		['SUSPICION', Object.values(SuspicionReason)],
		['VERDICT', Object.values(SupervisorVerdict)],
	] as const)('%s labels every member of its enum', (name, members) => {
		expect(Object.keys(mapOf(name)).sort()).toEqual([...members].sort())
	})

	it('fase 5: the card says when the retry runs and that the supervisor escalated; the nudge says "n de m"', () => {
		expect(script).toContain("'Nova tentativa às ' + fmtNear(issue.retryingAt)")
		expect(script).toContain("'Escalada pelo supervisor'")
		expect(script).toContain("(i.outOf ? ' de ' + i.outOf : '')")
		expect(mapOf('RESOLUTION')[StopResolution.AUTO_RETRY]).toBe('tentado de novo pelo supervisor')
	})
})
