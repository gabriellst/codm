// ThinkingCues — MÓDULO FOLHA, zero imports.
// Consumido pelo daemon (mensagem de fase no canal) E pelo console (spinner do chat), ambos
// importando `@codm/contracts/cues` DIRETO — uma lista só (spec AC-5). Vive em `@codm/contracts`
// (não em `@codm/core-typescript`) porque é vocabulário COMPARTILHADO entre os dois lados do wire, e
// `packages/app/react` nunca pode importar um pacote de backend (import-direction R5). A ausência de
// imports aqui é CONTRATO: o bundle do console puxa este arquivo sem arrastar o kernel Node do core
// (validado pelo build-spa em T3).

/** Os 26 glifos da diretiva do founder, ROTACIONADOS para abrir em ✻, + o retorno a ✻. */
export const THINKING_GLYPHS = [
	'✻',
	'✼',
	'✽',
	'✾',
	'✿',
	'❀',
	'❁',
	'❂',
	'❃',
	'❄',
	'❅',
	'❆',
	'❇',
	'❈',
	'✦',
	'✧',
	'✱',
	'✲',
	'✳',
	'✴',
	'✵',
	'✶',
	'✷',
	'✸',
	'✹',
	'✺',
	'✻',
] as const

export interface SpinnerFrame {
	glyph: (typeof THINKING_GLYPHS)[number]
	delayMs: number
}

/**
 * Delays por frame com ease-in-out INVERTIDO em tempo: o ciclo acelera até o meio e
 * desacelera nas pontas ("rápida no meio e no final desacelera" — founder). O peso de cada
 * frame é 1 + amplitude·cos(2π·t) normalizado, distribuindo `totalMs` de forma que os
 * extremos (✻→ e →✻) durem mais que o miolo.
 */
export function easeSpinnerFrames(totalMs: number): SpinnerFrame[] {
	const n = THINKING_GLYPHS.length
	const weighted = THINKING_GLYPHS.map((glyph, i) => {
		const t = i / (n - 1)
		const weight = 1 - 0.85 * Math.cos(2 * Math.PI * (t - 0.5))
		return { glyph, weight }
	})
	const sum = weighted.reduce((total, w) => total + w.weight, 0)
	return weighted.map(({ glyph, weight }) => ({ glyph, delayMs: Math.round((weight / sum) * totalMs) }))
}

/** ~60 verbos PT (subset curado dos 185 built-in do claude-code-spinner-verbs). */
export const THINKING_VERBS = [
	'Pensando',
	'Analisando',
	'Arquitetando',
	'Calculando',
	'Cogitando',
	'Compilando',
	'Compondo',
	'Conectando',
	'Conjurando',
	'Considerando',
	'Construindo',
	'Costurando',
	'Criando',
	'Decifrando',
	'Deliberando',
	'Destilando',
	'Devaneando',
	'Elaborando',
	'Encadeando',
	'Engenhando',
	'Esboçando',
	'Esclarecendo',
	'Escrevendo',
	'Estruturando',
	'Examinando',
	'Explorando',
	'Fabricando',
	'Fermentando',
	'Formulando',
	'Forjando',
	'Germinando',
	'Idealizando',
	'Iluminando',
	'Imaginando',
	'Improvisando',
	'Intuindo',
	'Investigando',
	'Lapidando',
	'Malabarizando',
	'Manifestando',
	'Maquinando',
	'Matutando',
	'Meditando',
	'Mergulhando',
	'Moldando',
	'Orquestrando',
	'Organizando',
	'Ponderando',
	'Processando',
	'Raciocinando',
	'Refinando',
	'Refletindo',
	'Ruminando',
	'Sintetizando',
	'Sonhando',
	'Tecendo',
	'Teorizando',
	'Traduzindo',
	'Tramando',
	'Vislumbrando',
] as const

export type ThinkingVerb = (typeof THINKING_VERBS)[number]

/** Verbos que `describeToolActivity` deriva da FAMÍLIA da ferramenta — fechados como o pool sorteado, para que a linha de fase nunca aceite uma string solta. */
export const TOOL_VERBS = ['Lendo', 'Procurando', 'Editando', 'Executando', 'Pesquisando', 'Delegando', 'Usando', 'Trabalhando'] as const
export type ToolVerb = (typeof TOOL_VERBS)[number]
/** Qualquer verbo que uma linha de fase pode carregar: o sorteado (abertura) ou o derivado da ferramenta. */
export type PhaseVerb = ThinkingVerb | ToolVerb

/** Sorteia um verbo, nunca o imediatamente anterior (AC-5). */
export function pickThinkingVerb(previous?: string): ThinkingVerb {
	const pool = previous ? THINKING_VERBS.filter(v => v !== previous) : THINKING_VERBS
	return pool[Math.floor(Math.random() * pool.length)] as ThinkingVerb
}

/**
 * A linha da mensagem de fase no canal: glifo + O VERBO, e nada mais — "✻ Destilando…" — ou, quando
 * há um `detail` (o alvo da ferramenta em uso, `describeToolActivity`), glifo + verbo + separador +
 * detalhe — "✻ Lendo… · Thread.ts".
 *
 * SEM o prefixo fixo "Pensando — " (founder: só a palavra de fato). "Pensando" continua existindo —
 * é só mais um verbo do pool (`THINKING_VERBS[0]`), sorteado como qualquer outro — mas deixou de ser
 * um rótulo fixo repetido na frente de todo verbo diferente que o sorteio escolhe.
 *
 * `verb` aceita `string` (não só `ThinkingVerb`) porque `describeToolActivity` devolve verbos
 * PT ("Lendo", "Editando"...) que não fazem parte do pool sorteado por `pickThinkingVerb` — ambos os
 * vocabulários alimentam esta mesma linha.
 */
export function thinkingLine(verb: PhaseVerb, glyph: SpinnerFrame['glyph'] = '✻', detail?: string): string {
	return detail ? `${glyph} ${verb}… · ${detail}` : `${glyph} ${verb}…`
}

/** O par (verbo, alvo) que descreve UMA ferramenta em uso — o que a linha de fase mostra ao contato. */
export interface ToolActivity {
	verb: ToolVerb
	target?: string
}

/** Teto de tamanho do `target` — "tudo truncado a ~48 chars" (spec, regra 2). */
const TOOL_TARGET_MAX_LENGTH = 48
/** `Bash` é o único caso com teto próprio, mais curto — "primeiros ~40 chars, sem quebras" (spec). */
const BASH_COMMAND_MAX_LENGTH = 40

const READ_TOOLS = new Set(['Read'])
const SEARCH_TOOLS = new Set(['Glob', 'Grep'])
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DELEGATE_TOOLS = new Set(['Agent', 'Task'])
const MCP_TOOL_PREFIX = 'mcp__'

/** Colapsa quebras/espaços em um só, e corta com "…" — nunca revela mais que `max` caracteres. */
function truncate(text: string, max: number): string {
	const flat = text.replace(/\s+/g, ' ').trim()
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/**
 * O ÚLTIMO segmento de um path — NUNCA o path absoluto (requisito de sanitização, spec regra 2). Um
 * `file_path` como `/Users/op/repo/src/thread/Thread.ts` vira só `Thread.ts`.
 */
function basename(path: string): string {
	const segments = path.split(/[\\/]/).filter(segment => segment.length > 0)
	return segments[segments.length - 1] ?? path
}

function stringField(input: unknown, ...keys: string[]): string | undefined {
	if (typeof input !== 'object' || input === null) return undefined
	const record = input as Record<string, unknown>
	for (const key of keys) {
		const value = record[key]
		if (typeof value === 'string' && value.trim().length > 0) return value
	}
	return undefined
}

/** `fooBarBAZQux` → `foo Bar BAZ Qux` — humaniza o nome de uma tool MCP para exibição. */
function humanize(name: string): string {
	return name
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.trim()
}

function safeHostname(url: string): string | undefined {
	try {
		return new URL(url).hostname
	} catch {
		return undefined
	}
}

/**
 * Traduz UMA invocação de ferramenta (`tool` + `input` bruto do wire) num par (verbo, alvo) SANITIZADO
 * para a linha de fase do canal (spec regra 2). Puro, sem I/O — testado isoladamente.
 *
 * O CONTRATO DE SANITIZAÇÃO é o ponto do módulo: nunca devolve um path absoluto (só o basename),
 * nunca o conteúdo de um arquivo, e todo `target` é truncado a no máximo ~48 chars (40 para `Bash`).
 * `input` pode ser omitido — o verbo é sempre determinável só pelo nome da tool; o alvo, não, e nesse
 * caso vem `undefined` (a linha então cai no formato de hoje, sem detalhe — ver `thinkingLine`).
 *
 * O mapa é TOTAL: toda tool cai em alguma família, até a desconhecida ("Trabalhando" + o nome da
 * própria tool, que não é dado sensível — é um identificador que o sistema já conhece).
 */
export function describeToolActivity(tool: string, input?: unknown): ToolActivity {
	if (READ_TOOLS.has(tool)) {
		const path = stringField(input, 'file_path', 'path')
		return { verb: 'Lendo', target: path ? truncate(basename(path), TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (SEARCH_TOOLS.has(tool)) {
		const pattern = stringField(input, 'pattern')
		return { verb: 'Procurando', target: pattern ? truncate(`"${pattern}"`, TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (EDIT_TOOLS.has(tool)) {
		const path = stringField(input, 'file_path', 'notebook_path', 'path')
		return { verb: 'Editando', target: path ? truncate(basename(path), TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (tool === 'Bash') {
		const command = stringField(input, 'command')
		return { verb: 'Executando', target: command ? truncate(command, BASH_COMMAND_MAX_LENGTH) : undefined }
	}
	if (tool === 'WebFetch' || tool === 'WebSearch') {
		const url = stringField(input, 'url')
		const query = stringField(input, 'query')
		const target = url ? (safeHostname(url) ?? url) : query
		return { verb: 'Pesquisando', target: target ? truncate(target, TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (DELEGATE_TOOLS.has(tool)) {
		return { verb: 'Delegando', target: 'subagente' }
	}
	if (tool.startsWith(MCP_TOOL_PREFIX)) {
		const parts = tool.split('__')
		const name = parts[parts.length - 1] || tool
		return { verb: 'Usando', target: truncate(humanize(name), TOOL_TARGET_MAX_LENGTH) }
	}
	return { verb: 'Trabalhando', target: truncate(tool, TOOL_TARGET_MAX_LENGTH) }
}

/** Espaçamento mínimo entre duas edições de fase sucessivas — evita rajadas de PATCH no canal quando
 * o agente troca de ferramenta várias vezes em poucos ms (`RunOrchestratorTurn`, spec regra 4). Uma
 * mudança de fase que chega antes do intervalo fica pendente e é aplicada assim que o intervalo
 * seguinte permitir — NUNCA por um `setTimeout` solto, só reagindo ao próximo frame do run. */
export const PHASE_EDIT_MIN_INTERVAL_MS = 1500
