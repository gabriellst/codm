// ThinkingCues — o DECK DE COPY das pistas de "pensando", em cada idioma que o produto fala.
//
// Consumido pelo daemon (mensagem de fase no canal) E pelo console (spinner do chat), ambos
// importando `@codm/contracts/cues` DIRETO — um deck só (spec AC-5). Vive em `@codm/contracts`
// (não em `@codm/core-typescript`) porque é vocabulário COMPARTILHADO entre os dois lados do wire, e
// `packages/app/react` nunca pode importar um pacote de backend (import-direction R5).
//
// ### Por que o DECK mora aqui, e não no daemon com só a forma em contracts
// Foi a pergunta explícita do founder ao ratificar a i18n destas pistas. A resposta é o CONSUMIDOR:
// o console renderiza o spinner CLIENT-SIDE (`SessionChatSection/ThinkingIndicator`), sorteando o
// verbo no browser — ele não recebe a palavra pronta do backend. Um deck que morasse em
// `packages/api/typescript` seria inalcançável para ele, e a alternativa (fazer o daemon sortear e
// mandar a palavra pelo fio) trocaria uma constante por um campo de read-model que muda a cada 2s.
// Então o deck é do contracts, e a regra é a que o `THREAD_MESSAGES` do daemon já estabelece para
// copy renderizada no servidor: a EXCEÇÃO nomeada existe onde o frontend não pode traduzir — aqui,
// porque quem renderiza a linha de fase é o WhatsApp, e porque a palavra do spinner é sorteada de um
// pool que os dois lados precisam compartilhar byte a byte.
//
// ### O único import, e o que continua sendo contrato
// `Language` vem do ARQUIVO gerado (`.../wire/enums/language`), não do barril: o barril reexporta ~40
// módulos e o bundle do console pagaria por todos. O arquivo é um `enum` puro, sem imports próprios —
// o que preserva a propriedade que a ausência de imports garantia antes: este módulo NÃO arrasta o
// kernel Node do core para o bundle do SPA (validado pelo build-spa em T3).
import { Language } from '../../generated/typescript/src/wire/enums/language'

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

// ── O IDIOMA DO DECK ───────────────────────────────────────────────────────────────────────────

/**
 * Os idiomas em que este deck está ESCRITO — hoje o enum `Language` inteiro.
 *
 * Declarado à parte do enum, e não derivado dele, pela mesma razão que `CATALOG_LANGUAGES` no daemon
 * (`@shared/i18n/messages.ts`) é declarado à parte: um produto ALARGA o enum de contrato primeiro e
 * escreve a copy depois, e durante essa janela um membro sem deck precisa colapsar no default em vez
 * de derrubar um `Record` incompleto. Acrescentar um idioma AQUI é o que obriga (erro de compilação)
 * cada tabela abaixo a ganhar sua coluna.
 */
export const CUE_LANGUAGES = [Language.PT_BR, Language.EN_US] as const
export type CueLanguage = (typeof CUE_LANGUAGES)[number]

/**
 * O QUE UM CHAMADOR PODE ENTREGAR como idioma: o membro do enum, OU a tag nua que ele vale.
 *
 * As duas grafias são a MESMA coisa e chegam das duas pontas que este módulo serve. O daemon importa o
 * `enum Language` gerado e passa `Language.PT_BR`. O console lê o idioma do READ-MODEL, pelo SDK, onde
 * um enum de contrato vira união de strings (`'pt-BR' | 'en-US'`) — porque é isso que trafega no fio.
 *
 * Aceitar as duas não é afrouxar o tipo: `\`${Language}\`` é DERIVADO do enum, então um locale que o
 * contrato não declara continua sendo erro de compilação nos dois lados. O que ela remove é a única
 * alternativa, que seria o console recastar a string para o enum na borda — um `as` por call site,
 * escondendo justamente a conversão que precisa ser verdadeira.
 */
export type LanguageInput = Language | `${Language}`

/**
 * PARA ONDE CAI UM LOCALE DESCONHECIDO — decisão explícita, não acidente de `Record`.
 *
 * pt-BR, que é o mesmo `DEFAULT_LANGUAGE` do catálogo de servidor (`@shared/i18n/messages.ts`). Os
 * dois são declarados separadamente porque este módulo é FOLHA (não pode importar o daemon) e aquele
 * fala de catálogos de servidor; um teste no daemon prende os dois juntos, para que "o idioma padrão
 * do produto" nunca tenha duas respostas.
 */
export const DEFAULT_CUE_LANGUAGE: CueLanguage = Language.PT_BR

/** Colapsa qualquer idioma (ou a sua ausência) sobre um que este deck realmente escreve. */
export function resolveCueLanguage(language?: LanguageInput | null): CueLanguage {
	if (language && (CUE_LANGUAGES as readonly string[]).includes(language)) return language as CueLanguage
	return DEFAULT_CUE_LANGUAGE
}

// ── O POOL SORTEADO ────────────────────────────────────────────────────────────────────────────

/** ~60 verbos PT (subset curado dos 185 built-in do claude-code-spinner-verbs). */
export const THINKING_VERBS_PT = [
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

/**
 * ~45 verbos EN — COPY ESCRITA, não tradução (decisão 4 do founder).
 *
 * A lista PT não foi passada por um dicionário: 'Fermentando' não virou 'Fermenting' (que descreve
 * cerveja, não pensamento) e 'Malabarizando' não virou 'Juggling balls'. O que foi portado é o
 * ESPÍRITO — o mesmo humor de cozinha, oficina e feitiçaria que faz a lista PT ser divertida —
 * escrito com as palavras que um falante de inglês de fato usaria para "estou trabalhando nisso":
 * 'Brewing', 'Percolating', 'Marinating' cobrem o registro de 'Fermentando'; 'Noodling',
 * 'Tinkering', 'Whittling' cobrem o de 'Lapidando'/'Matutando'; 'Spelunking' e 'Rummaging' entram
 * porque a lista PT também tem entradas que ninguém esperaria numa barra de progresso.
 *
 * A regra formal é a mesma dos PT (verificada por teste): uma palavra só, gerúndio (-ing), sem
 * repetição — para que a linha `✻ <verbo>…` leia igual nos dois idiomas.
 */
export const THINKING_VERBS_EN = [
	'Thinking',
	'Pondering',
	'Musing',
	'Brewing',
	'Percolating',
	'Conjuring',
	'Juggling',
	'Untangling',
	'Noodling',
	'Wrangling',
	'Scheming',
	'Plotting',
	'Weaving',
	'Forging',
	'Whittling',
	'Sketching',
	'Distilling',
	'Simmering',
	'Marinating',
	'Tinkering',
	'Puzzling',
	'Wondering',
	'Chewing',
	'Digging',
	'Sifting',
	'Piecing',
	'Stitching',
	'Charting',
	'Mapping',
	'Drafting',
	'Composing',
	'Assembling',
	'Hatching',
	'Kindling',
	'Ruminating',
	'Deliberating',
	'Reckoning',
	'Calibrating',
	'Divining',
	'Wrestling',
	'Rummaging',
	'Sculpting',
	'Threading',
	'Spelunking',
	'Herding',
	'Cooking',
] as const

/** O pool sorteado, por idioma. Uma coluna por membro de `CUE_LANGUAGES` — o `Record` é o gate. */
export const THINKING_VERBS: Record<CueLanguage, readonly string[]> = {
	[Language.PT_BR]: THINKING_VERBS_PT,
	[Language.EN_US]: THINKING_VERBS_EN,
}

export type ThinkingVerb = (typeof THINKING_VERBS_PT)[number] | (typeof THINKING_VERBS_EN)[number]

/**
 * Sorteia um verbo do pool DAQUELE idioma, nunca o imediatamente anterior (AC-5).
 *
 * `language` vem primeiro porque é o que decide QUAL pool — `previous` é uma memória dentro dele.
 * Ausente ⇒ `DEFAULT_CUE_LANGUAGE`, o mesmo colapso que todo consumidor deste módulo herda.
 */
export function pickThinkingVerb(language?: LanguageInput | null, previous?: string): ThinkingVerb {
	const verbs = THINKING_VERBS[resolveCueLanguage(language)]
	const pool = previous ? verbs.filter(v => v !== previous) : verbs
	return pool[Math.floor(Math.random() * pool.length)] as ThinkingVerb
}

// ── A LINHA ────────────────────────────────────────────────────────────────────────────────────

/**
 * A linha da mensagem de fase no canal: glifo + O VERBO, e nada mais — "✻ Destilando…" — ou, quando
 * há um `detail` (o alvo da ferramenta em uso, `localizeToolActivity`), glifo + verbo + separador +
 * detalhe — "✻ Lendo… · Thread.ts".
 *
 * SEM o prefixo fixo "Pensando — " (founder: só a palavra de fato). "Pensando" continua existindo —
 * é só mais um verbo do pool (`THINKING_VERBS_PT[0]`), sorteado como qualquer outro — mas deixou de
 * ser um rótulo fixo repetido na frente de todo verbo diferente que o sorteio escolhe.
 *
 * `verb` é `PhaseVerb` — a união FECHADA dos dois vocabulários que alimentam esta linha (o pool
 * sorteado e o verbo derivado da família da ferramenta), em qualquer idioma que o deck escreva. Não é
 * `string`: uma linha de fase carrega uma palavra do deck, e afrouxar aqui apagaria justamente a
 * exaustividade que faz um idioma novo virar erro de compilação em vez de uma linha em branco.
 */
export function thinkingLine(verb: PhaseVerb, glyph: SpinnerFrame['glyph'] = '✻', detail?: string): string {
	return detail ? `${glyph} ${verb}… · ${detail}` : `${glyph} ${verb}…`
}

// ── A FERRAMENTA EM USO ────────────────────────────────────────────────────────────────────────

/**
 * O QUE uma invocação de ferramenta É — a classificação, fechada, e SEM idioma nenhum.
 *
 * Antes desta separação `describeToolActivity` devolvia a PALAVRA ('Lendo'), o que fazia da
 * classificação e da copy um fato só e tornava a linha de fase intraduzível sem reescrever o
 * classificador. Agora o classificador responde `READ`, e a palavra é uma consulta ao deck
 * (`localizeToolActivity`) — a mesma separação que o resto do repositório faz entre um enum de
 * contrato e o rótulo que o app renderiza para ele.
 */
export const TOOL_ACTIVITY_KINDS = ['READ', 'SEARCH', 'EDIT', 'RUN', 'BROWSE', 'DELEGATE', 'USE', 'WORK'] as const
export type ToolActivityKind = (typeof TOOL_ACTIVITY_KINDS)[number]

/** O par (o que é, sobre o quê) que descreve UMA ferramenta em uso. `target` é sempre DADO, nunca copy. */
export interface ToolActivity {
	kind: ToolActivityKind
	target?: string
}

/**
 * A copy de cada família de ferramenta, por idioma. UMA tabela, e todo o resto é derivado dela.
 *
 * `target` aqui é o alvo PADRÃO da família — hoje só `DELEGATE` tem um, porque delegar não tem alvo
 * que se possa mostrar (o prompt delegado é justamente o que não pode vazar) e a palavra "subagente"
 * é copy, não dado. Declarar como CAMPO em vez de tratar `DELEGATE` como caso especial mantém
 * `localizeToolActivity` sem desvio: `activity.target ?? copy.target`, uniforme para as oito famílias.
 *
 * `as const satisfies` e não uma anotação de tipo: o `satisfies` é o GATE (um idioma ou uma família
 * sem entrada é erro de compilação) e o `as const` preserva os literais, que é o que permite derivar
 * `ToolVerb` daqui em vez de redigitar a lista de verbos ao lado da tabela que já os contém.
 */
const TOOL_COPY = {
	[Language.PT_BR]: {
		READ: { verb: 'Lendo' },
		SEARCH: { verb: 'Procurando' },
		EDIT: { verb: 'Editando' },
		RUN: { verb: 'Executando' },
		BROWSE: { verb: 'Pesquisando' },
		DELEGATE: { verb: 'Delegando', target: 'subagente' },
		USE: { verb: 'Usando' },
		WORK: { verb: 'Trabalhando' },
	},
	[Language.EN_US]: {
		READ: { verb: 'Reading' },
		SEARCH: { verb: 'Searching' },
		EDIT: { verb: 'Editing' },
		RUN: { verb: 'Running' },
		BROWSE: { verb: 'Browsing' },
		DELEGATE: { verb: 'Delegating', target: 'a subagent' },
		USE: { verb: 'Using' },
		WORK: { verb: 'Working' },
	},
} as const satisfies Record<CueLanguage, Record<ToolActivityKind, { verb: string; target?: string }>>

/**
 * Todo verbo que uma FAMÍLIA de ferramenta pode carregar, em qualquer idioma do deck — fechado, como
 * o pool sorteado. DERIVADO da tabela acima: uma segunda lista ao lado dela seria a mesma informação
 * duas vezes, e a primeira a ficar velha decidiria o tipo.
 */
export type ToolVerb = (typeof TOOL_COPY)[CueLanguage][ToolActivityKind]['verb']

/** Qualquer verbo que uma linha de fase pode carregar: o sorteado (abertura) ou o da ferramenta. */
export type PhaseVerb = ThinkingVerb | ToolVerb

/** O par (verbo, alvo) já em UM idioma — o que a linha de fase mostra ao contato. */
export interface LocalizedToolActivity {
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
 * Traduz UMA invocação de ferramenta (`tool` + `input` bruto do wire) num par (família, alvo)
 * SANITIZADO para a linha de fase do canal (spec regra 2). Puro, sem I/O, e SEM IDIOMA — testado
 * isoladamente.
 *
 * O CONTRATO DE SANITIZAÇÃO é o ponto do módulo: nunca devolve um path absoluto (só o basename),
 * nunca o conteúdo de um arquivo, e todo `target` é truncado a no máximo ~48 chars (40 para `Bash`).
 * `input` pode ser omitido — a família é sempre determinável só pelo nome da tool; o alvo, não, e
 * nesse caso vem `undefined` (a linha então cai no formato de hoje, sem detalhe — ver `thinkingLine`).
 *
 * O mapa é TOTAL: toda tool cai em alguma família, até a desconhecida (`WORK` + o nome da própria
 * tool, que não é dado sensível — é um identificador que o sistema já conhece).
 */
export function describeToolActivity(tool: string, input?: unknown): ToolActivity {
	if (READ_TOOLS.has(tool)) {
		const path = stringField(input, 'file_path', 'path')
		return { kind: 'READ', target: path ? truncate(basename(path), TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (SEARCH_TOOLS.has(tool)) {
		const pattern = stringField(input, 'pattern')
		return { kind: 'SEARCH', target: pattern ? truncate(`"${pattern}"`, TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (EDIT_TOOLS.has(tool)) {
		const path = stringField(input, 'file_path', 'notebook_path', 'path')
		return { kind: 'EDIT', target: path ? truncate(basename(path), TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (tool === 'Bash') {
		const command = stringField(input, 'command')
		return { kind: 'RUN', target: command ? truncate(command, BASH_COMMAND_MAX_LENGTH) : undefined }
	}
	if (tool === 'WebFetch' || tool === 'WebSearch') {
		const url = stringField(input, 'url')
		const query = stringField(input, 'query')
		const target = url ? (safeHostname(url) ?? url) : query
		return { kind: 'BROWSE', target: target ? truncate(target, TOOL_TARGET_MAX_LENGTH) : undefined }
	}
	if (DELEGATE_TOOLS.has(tool)) {
		// SEM alvo de dado, e é deliberado: o prompt delegado é exatamente o que não pode vazar. A
		// palavra que aparece na linha ("subagente") é copy e vem do deck, em `TOOL_COPY`.
		return { kind: 'DELEGATE' }
	}
	if (tool.startsWith(MCP_TOOL_PREFIX)) {
		const parts = tool.split('__')
		const name = parts[parts.length - 1] || tool
		return { kind: 'USE', target: truncate(humanize(name), TOOL_TARGET_MAX_LENGTH) }
	}
	return { kind: 'WORK', target: truncate(tool, TOOL_TARGET_MAX_LENGTH) }
}

/** A copy de uma família de ferramenta, num idioma — o verbo e o alvo padrão da família. */
export function toolActivityCopy(kind: ToolActivityKind, language?: LanguageInput | null): LocalizedToolActivity {
	return TOOL_COPY[resolveCueLanguage(language)][kind]
}

/**
 * Veste uma atividade classificada com a copy do idioma: o verbo da família, e o alvo que a própria
 * invocação trouxe — ou, quando ela não traz nenhum, o alvo padrão que a família declara.
 */
export function localizeToolActivity(activity: ToolActivity, language?: LanguageInput | null): LocalizedToolActivity {
	const copy = toolActivityCopy(activity.kind, language)
	return { verb: copy.verb, target: activity.target ?? copy.target }
}

/**
 * A copy amigável para a qual o placeholder "Pensando" é editado quando um turno termina SEM
 * entregar resposta (thinking-indicator spec, AC-6) — nunca deixado de pé como se o agente ainda
 * estivesse trabalhando.
 *
 * Mora AQUI, no deck, e não num catálogo do daemon, porque é o ÚLTIMO FRAME da mesma linha: mesma
 * mensagem, mesmo `messageId`, mesma decisão de idioma que abriu o placeholder com um verbo daqui.
 * Era a única string desta superfície fora do deck, e a distância era o defeito — a linha podia abrir
 * em inglês e fechar em português.
 */
const THINKING_ERROR: Record<CueLanguage, string> = {
	[Language.PT_BR]: 'Tive um problema para terminar essa tarefa. Pode tentar de novo?',
	[Language.EN_US]: 'I hit a problem finishing that one. Want me to try again?',
}

export function thinkingErrorCopy(language?: LanguageInput | null): string {
	return THINKING_ERROR[resolveCueLanguage(language)]
}

/** Espaçamento mínimo entre duas edições de fase sucessivas — evita rajadas de PATCH no canal quando
 * o agente troca de ferramenta várias vezes em poucos ms (`RunOrchestratorTurn`, spec regra 4). Uma
 * mudança de fase que chega antes do intervalo fica pendente e é aplicada assim que o intervalo
 * seguinte permitir — NUNCA por um `setTimeout` solto, só reagindo ao próximo frame do run. */
export const PHASE_EDIT_MIN_INTERVAL_MS = 1500
