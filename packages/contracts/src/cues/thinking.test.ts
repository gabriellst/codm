import { describe, expect, it } from 'bun:test'
import { THINKING_GLYPHS, THINKING_VERBS, describeToolActivity, easeSpinnerFrames, pickThinkingVerb, thinkingLine } from './thinking'

describe('THINKING_GLYPHS', () => {
	it('é o ciclo rotacionado: começa e termina em ✻ (AC-4)', () => {
		expect(THINKING_GLYPHS[0]).toBe('✻')
		expect(THINKING_GLYPHS[THINKING_GLYPHS.length - 1]).toBe('✻')
		// os 26 glifos da diretiva + o retorno ao inicial
		expect(THINKING_GLYPHS.length).toBe(27)
		expect(new Set(THINKING_GLYPHS.slice(0, -1)).size).toBe(26)
	})
})

describe('easeSpinnerFrames', () => {
	it('rápido no meio, desacelera nas pontas (ease-in-out invertido em delay)', () => {
		const frames = easeSpinnerFrames(2000)
		expect(frames.length).toBe(THINKING_GLYPHS.length)
		const delays = frames.map(f => f.delayMs)
		const mid = Math.floor(delays.length / 2)
		const firstDelay = delays.at(0)
		const midDelay = delays.at(mid)
		const lastDelay = delays.at(-1)
		if (firstDelay === undefined || midDelay === undefined || lastDelay === undefined) throw new Error('delays vazio')
		expect(firstDelay).toBeGreaterThan(midDelay)
		expect(lastDelay).toBeGreaterThan(midDelay)
		// soma ≈ duração pedida (tolerância de arredondamento por frame)
		const total = delays.reduce((a, b) => a + b, 0)
		expect(Math.abs(total - 2000)).toBeLessThanOrEqual(frames.length)
	})
	it('primeiro e último frame carregam ✻', () => {
		const frames = easeSpinnerFrames(1000)
		const first = frames.at(0)
		const last = frames.at(-1)
		if (!first || !last) throw new Error('frames vazio')
		expect(first.glyph).toBe('✻')
		expect(last.glyph).toBe('✻')
	})
})

describe('pickThinkingVerb', () => {
	it('nunca repete o verbo imediatamente anterior (AC-5)', () => {
		let prev = pickThinkingVerb()
		for (let i = 0; i < 200; i++) {
			const next = pickThinkingVerb(prev)
			expect(next).not.toBe(prev)
			expect(THINKING_VERBS).toContain(next)
			prev = next
		}
	})
	it('a lista tem ~60 verbos PT únicos terminados em -ndo', () => {
		expect(THINKING_VERBS.length).toBeGreaterThanOrEqual(55)
		expect(new Set(THINKING_VERBS).size).toBe(THINKING_VERBS.length)
		for (const v of THINKING_VERBS) expect(v).toMatch(/ndo$/)
	})
})

describe('thinkingLine', () => {
	it('é SÓ o glifo + o verbo — sem o prefixo fixo "Pensando —" (bug fix, founder)', () => {
		expect(thinkingLine('Destilando')).toBe('✻ Destilando…')
		expect(thinkingLine('Destilando', '✼')).toBe('✼ Destilando…')
		expect(thinkingLine('Destilando')).not.toContain('Pensando')
	})
	it('quando o verbo sorteado É "Pensando", ele aparece como o verbo — não como um rótulo fixo', () => {
		expect(thinkingLine('Pensando')).toBe('✻ Pensando…')
	})
	it('com detalhe, o separador " · " aparece entre o verbo e o alvo', () => {
		expect(thinkingLine('Lendo', '✼', 'Thread.ts')).toBe('✼ Lendo… · Thread.ts')
	})
	it('sem detalhe, o formato de hoje é preservado — nenhum " · " sobra na linha', () => {
		expect(thinkingLine('Lendo', '✼', undefined)).toBe('✼ Lendo…')
	})
})

describe('describeToolActivity', () => {
	it('Read → "Lendo" + o BASENAME do arquivo, nunca o path absoluto', () => {
		expect(describeToolActivity('Read', { file_path: '/Users/op/repo/src/thread/Thread.ts' })).toEqual({
			verb: 'Lendo',
			target: 'Thread.ts',
		})
	})
	it('Glob/Grep → "Procurando" + o pattern entre aspas', () => {
		expect(describeToolActivity('Glob', { pattern: '**/*.test.ts' })).toEqual({ verb: 'Procurando', target: '"**/*.test.ts"' })
		expect(describeToolActivity('Grep', { pattern: 'mentionGate' })).toEqual({ verb: 'Procurando', target: '"mentionGate"' })
	})
	it('Edit/Write/MultiEdit/NotebookEdit → "Editando" + o basename', () => {
		for (const tool of ['Edit', 'Write', 'MultiEdit'] as const) {
			expect(describeToolActivity(tool, { file_path: '/tmp/workspace/src/foo.ts' })).toEqual({ verb: 'Editando', target: 'foo.ts' })
		}
		expect(describeToolActivity('NotebookEdit', { notebook_path: '/tmp/workspace/analysis.ipynb' })).toEqual({
			verb: 'Editando',
			target: 'analysis.ipynb',
		})
	})
	it('Bash → "Executando" + o comando, truncado a ~40 chars e sem quebras de linha', () => {
		expect(describeToolActivity('Bash', { command: 'bun test src/thread' })).toEqual({ verb: 'Executando', target: 'bun test src/thread' })
		const long = describeToolActivity('Bash', { command: `git commit -m "fix\nthe thing that was broken across two lines of message"` })
		expect(long.verb).toBe('Executando')
		expect(long.target).not.toContain('\n')
		expect(long.target?.length).toBeLessThanOrEqual(40)
		expect(long.target?.endsWith('…')).toBe(true)
	})
	it('WebFetch → "Pesquisando" + o host da URL (nunca a URL inteira)', () => {
		expect(describeToolActivity('WebFetch', { url: 'https://docs.anthropic.com/en/api/messages?x=1' })).toEqual({
			verb: 'Pesquisando',
			target: 'docs.anthropic.com',
		})
	})
	it('WebSearch → "Pesquisando" + a query truncada', () => {
		expect(describeToolActivity('WebSearch', { query: 'claude code spinner verbs' })).toEqual({
			verb: 'Pesquisando',
			target: 'claude code spinner verbs',
		})
	})
	it('Agent/Task → "Delegando" + "subagente" fixo — nunca o prompt delegado', () => {
		expect(describeToolActivity('Agent', { prompt: 'faça uma varredura completa do repositório e resuma tudo' })).toEqual({
			verb: 'Delegando',
			target: 'subagente',
		})
		expect(describeToolActivity('Task', {})).toEqual({ verb: 'Delegando', target: 'subagente' })
	})
	it('mcp__codm__X → "Usando" + X humanizado (CamelCase → palavras)', () => {
		expect(describeToolActivity('mcp__codm__RecordArtifact', {})).toEqual({ verb: 'Usando', target: 'Record Artifact' })
	})
	it('ferramenta desconhecida → "Trabalhando" + o próprio nome da tool', () => {
		expect(describeToolActivity('SomeFutureTool', { anything: 'here' })).toEqual({ verb: 'Trabalhando', target: 'SomeFutureTool' })
	})
	it('sem input reconhecível → alvo undefined (a linha cai no formato de hoje, sem detalhe)', () => {
		expect(describeToolActivity('Read', {})).toEqual({ verb: 'Lendo', target: undefined })
		expect(describeToolActivity('Read')).toEqual({ verb: 'Lendo', target: undefined })
		expect(describeToolActivity('Bash', { command: '' })).toEqual({ verb: 'Executando', target: undefined })
	})
	it('nunca vaza o path absoluto — só o basename, mesmo com separadores mistos', () => {
		expect(describeToolActivity('Read', { file_path: 'C:\\Users\\op\\repo\\Thread.ts' }).target).toBe('Thread.ts')
		expect(describeToolActivity('Edit', { file_path: '/a/b/c/d/e/f/g/VeryDeeplyNestedFile.ts' }).target).toBe('VeryDeeplyNestedFile.ts')
	})
})
