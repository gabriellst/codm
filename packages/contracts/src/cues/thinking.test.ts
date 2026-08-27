import { describe, expect, it } from 'bun:test'
import { Language } from '../../generated/typescript/src/wire/enums/language'
import {
	CUE_LANGUAGES,
	DEFAULT_CUE_LANGUAGE,
	THINKING_GLYPHS,
	THINKING_VERBS,
	THINKING_VERBS_EN,
	THINKING_VERBS_PT,
	TOOL_ACTIVITY_KINDS,
	describeToolActivity,
	easeSpinnerFrames,
	localizeToolActivity,
	pickThinkingVerb,
	resolveCueLanguage,
	thinkingErrorCopy,
	thinkingLine,
	toolActivityCopy,
} from './thinking'

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

describe('resolveCueLanguage — para onde cai um locale desconhecido', () => {
	it('um idioma que o deck escreve passa intacto', () => {
		for (const language of CUE_LANGUAGES) expect(resolveCueLanguage(language)).toBe(language)
	})
	it('ausência, null e um locale que o deck NÃO escreve caem em pt-BR — a decisão explícita', () => {
		expect(DEFAULT_CUE_LANGUAGE).toBe(Language.PT_BR)
		expect(resolveCueLanguage()).toBe(Language.PT_BR)
		expect(resolveCueLanguage(null)).toBe(Language.PT_BR)
		expect(resolveCueLanguage('fr-CH' as Language)).toBe(Language.PT_BR)
	})
})

describe('pickThinkingVerb', () => {
	it('nunca repete o verbo imediatamente anterior, em cada idioma (AC-5)', () => {
		for (const language of CUE_LANGUAGES) {
			let prev = pickThinkingVerb(language)
			for (let i = 0; i < 200; i++) {
				const next = pickThinkingVerb(language, prev)
				expect(next).not.toBe(prev)
				expect(THINKING_VERBS[language]).toContain(next)
				prev = next
			}
		}
	})
	it('sorteia do pool PT quando o idioma é desconhecido ou ausente — o mesmo colapso', () => {
		for (let i = 0; i < 50; i++) {
			expect(THINKING_VERBS_PT).toContain(pickThinkingVerb())
			expect(THINKING_VERBS_PT).toContain(pickThinkingVerb('fr-CH' as Language))
		}
	})
	it('um idioma NUNCA sorteia o verbo do outro', () => {
		const english = new Set<string>(THINKING_VERBS_EN)
		for (let i = 0; i < 200; i++) expect(english.has(pickThinkingVerb(Language.PT_BR))).toBe(false)
		const portuguese = new Set<string>(THINKING_VERBS_PT)
		for (let i = 0; i < 200; i++) expect(portuguese.has(pickThinkingVerb(Language.EN_US))).toBe(false)
	})
	it('a lista PT tem ~60 verbos únicos terminados em -ndo', () => {
		expect(THINKING_VERBS_PT.length).toBeGreaterThanOrEqual(55)
		expect(new Set(THINKING_VERBS_PT).size).toBe(THINKING_VERBS_PT.length)
		for (const v of THINKING_VERBS_PT) expect(v).toMatch(/ndo$/)
	})
	it('a lista EN tem ~40 verbos únicos, uma palavra só, em -ing (copy escrita, não tradução)', () => {
		expect(THINKING_VERBS_EN.length).toBeGreaterThanOrEqual(40)
		expect(new Set(THINKING_VERBS_EN).size).toBe(THINKING_VERBS_EN.length)
		for (const v of THINKING_VERBS_EN) expect(v).toMatch(/^[A-Z][a-z]+ing$/)
	})
	it('todo idioma do deck tem pool próprio e não-vazio — nenhum cai no do vizinho', () => {
		for (const language of CUE_LANGUAGES) expect(THINKING_VERBS[language].length).toBeGreaterThan(0)
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
	it('compõe o verbo inglês do mesmo jeito — a tipografia não tem idioma', () => {
		expect(thinkingLine('Reading', '✼', 'Thread.ts')).toBe('✼ Reading… · Thread.ts')
	})
})

describe('describeToolActivity — classificação SEM idioma', () => {
	it('Read → READ + o BASENAME do arquivo, nunca o path absoluto', () => {
		expect(describeToolActivity('Read', { file_path: '/Users/op/repo/src/thread/Thread.ts' })).toEqual({
			kind: 'READ',
			target: 'Thread.ts',
		})
	})
	it('Glob/Grep → SEARCH + o pattern entre aspas', () => {
		expect(describeToolActivity('Glob', { pattern: '**/*.test.ts' })).toEqual({ kind: 'SEARCH', target: '"**/*.test.ts"' })
		expect(describeToolActivity('Grep', { pattern: 'mentionGate' })).toEqual({ kind: 'SEARCH', target: '"mentionGate"' })
	})
	it('Edit/Write/MultiEdit/NotebookEdit → EDIT + o basename', () => {
		for (const tool of ['Edit', 'Write', 'MultiEdit'] as const) {
			expect(describeToolActivity(tool, { file_path: '/tmp/workspace/src/foo.ts' })).toEqual({ kind: 'EDIT', target: 'foo.ts' })
		}
		expect(describeToolActivity('NotebookEdit', { notebook_path: '/tmp/workspace/analysis.ipynb' })).toEqual({
			kind: 'EDIT',
			target: 'analysis.ipynb',
		})
	})
	it('Bash → RUN + o comando, truncado a ~40 chars e sem quebras de linha', () => {
		expect(describeToolActivity('Bash', { command: 'bun test src/thread' })).toEqual({ kind: 'RUN', target: 'bun test src/thread' })
		const long = describeToolActivity('Bash', { command: `git commit -m "fix\nthe thing that was broken across two lines of message"` })
		expect(long.kind).toBe('RUN')
		expect(long.target).not.toContain('\n')
		expect(long.target?.length).toBeLessThanOrEqual(40)
		expect(long.target?.endsWith('…')).toBe(true)
	})
	it('WebFetch → BROWSE + o host da URL (nunca a URL inteira)', () => {
		expect(describeToolActivity('WebFetch', { url: 'https://docs.anthropic.com/en/api/messages?x=1' })).toEqual({
			kind: 'BROWSE',
			target: 'docs.anthropic.com',
		})
	})
	it('WebSearch → BROWSE + a query truncada', () => {
		expect(describeToolActivity('WebSearch', { query: 'claude code spinner verbs' })).toEqual({
			kind: 'BROWSE',
			target: 'claude code spinner verbs',
		})
	})
	it('Agent/Task → DELEGATE sem alvo nenhum — o prompt delegado nunca vira dado', () => {
		expect(describeToolActivity('Agent', { prompt: 'faça uma varredura completa do repositório e resuma tudo' })).toEqual({
			kind: 'DELEGATE',
		})
		expect(describeToolActivity('Task', {})).toEqual({ kind: 'DELEGATE' })
	})
	it('mcp__codm__X → USE + X humanizado (CamelCase → palavras)', () => {
		expect(describeToolActivity('mcp__codm__RecordArtifact', {})).toEqual({ kind: 'USE', target: 'Record Artifact' })
	})
	it('ferramenta desconhecida → WORK + o próprio nome da tool', () => {
		expect(describeToolActivity('SomeFutureTool', { anything: 'here' })).toEqual({ kind: 'WORK', target: 'SomeFutureTool' })
	})
	it('sem input reconhecível → alvo undefined (a linha cai no formato de hoje, sem detalhe)', () => {
		expect(describeToolActivity('Read', {})).toEqual({ kind: 'READ', target: undefined })
		expect(describeToolActivity('Read')).toEqual({ kind: 'READ', target: undefined })
		expect(describeToolActivity('Bash', { command: '' })).toEqual({ kind: 'RUN', target: undefined })
	})
	it('nunca vaza o path absoluto — só o basename, mesmo com separadores mistos', () => {
		expect(describeToolActivity('Read', { file_path: 'C:\\Users\\op\\repo\\Thread.ts' }).target).toBe('Thread.ts')
		expect(describeToolActivity('Edit', { file_path: '/a/b/c/d/e/f/g/VeryDeeplyNestedFile.ts' }).target).toBe('VeryDeeplyNestedFile.ts')
	})
	it('a classificação não carrega palavra nenhuma — nenhum alvo devolvido é copy', () => {
		// O alvo de DELEGATE ('subagente'/'a subagent') é a única copy que já viveu neste retorno; ela
		// mudou de lado e agora vem do deck, o que é exatamente o que torna a linha traduzível.
		expect(describeToolActivity('Agent').target).toBeUndefined()
	})
})

describe('toolActivityCopy / localizeToolActivity — a copy de cada família', () => {
	it('o deck é TOTAL sobre as famílias, em todo idioma que ele escreve', () => {
		for (const language of CUE_LANGUAGES) {
			for (const kind of TOOL_ACTIVITY_KINDS) {
				expect(toolActivityCopy(kind, language).verb.length).toBeGreaterThan(0)
			}
		}
	})
	it('PT mantém os verbos de hoje, byte a byte', () => {
		expect(toolActivityCopy('READ', Language.PT_BR).verb).toBe('Lendo')
		expect(toolActivityCopy('SEARCH', Language.PT_BR).verb).toBe('Procurando')
		expect(toolActivityCopy('EDIT', Language.PT_BR).verb).toBe('Editando')
		expect(toolActivityCopy('RUN', Language.PT_BR).verb).toBe('Executando')
		expect(toolActivityCopy('BROWSE', Language.PT_BR).verb).toBe('Pesquisando')
		expect(toolActivityCopy('DELEGATE', Language.PT_BR).verb).toBe('Delegando')
		expect(toolActivityCopy('USE', Language.PT_BR).verb).toBe('Usando')
		expect(toolActivityCopy('WORK', Language.PT_BR).verb).toBe('Trabalhando')
	})
	it('EN é copy própria, não o verbo PT com sotaque', () => {
		expect(toolActivityCopy('READ', Language.EN_US).verb).toBe('Reading')
		expect(toolActivityCopy('DELEGATE', Language.EN_US).verb).toBe('Delegating')
		expect(toolActivityCopy('WORK', Language.EN_US).verb).toBe('Working')
	})
	it('o alvo do DADO vence o alvo padrão da família', () => {
		expect(localizeToolActivity({ kind: 'READ', target: 'Thread.ts' }, Language.EN_US)).toEqual({ verb: 'Reading', target: 'Thread.ts' })
	})
	it('sem alvo de dado, a família empresta o seu — e é ele que muda de idioma', () => {
		expect(localizeToolActivity({ kind: 'DELEGATE' }, Language.PT_BR)).toEqual({ verb: 'Delegando', target: 'subagente' })
		expect(localizeToolActivity({ kind: 'DELEGATE' }, Language.EN_US)).toEqual({ verb: 'Delegating', target: 'a subagent' })
	})
	it('uma família sem alvo padrão e sem dado continua sem detalhe', () => {
		expect(localizeToolActivity({ kind: 'READ' }, Language.EN_US)).toEqual({ verb: 'Reading', target: undefined })
	})
	it('um locale desconhecido cai em PT, como todo o resto do deck', () => {
		expect(localizeToolActivity({ kind: 'DELEGATE' }, 'fr-CH' as Language)).toEqual({ verb: 'Delegando', target: 'subagente' })
	})
})

describe('thinkingErrorCopy — o último frame do placeholder', () => {
	it('fala o idioma da conversa', () => {
		expect(thinkingErrorCopy(Language.PT_BR)).toBe('Tive um problema para terminar essa tarefa. Pode tentar de novo?')
		expect(thinkingErrorCopy(Language.EN_US)).toBe('I hit a problem finishing that one. Want me to try again?')
	})
	it('ausência e locale desconhecido caem em pt-BR — a mesma decisão do resto do deck', () => {
		expect(thinkingErrorCopy()).toBe(thinkingErrorCopy(Language.PT_BR))
		expect(thinkingErrorCopy('fr-CH' as Language)).toBe(thinkingErrorCopy(Language.PT_BR))
	})
	it('nenhum idioma do deck fica sem a frase', () => {
		for (const language of CUE_LANGUAGES) expect(thinkingErrorCopy(language).length).toBeGreaterThan(0)
	})
})
