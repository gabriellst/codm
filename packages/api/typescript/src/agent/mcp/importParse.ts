import { McpImportRejection, McpTransport } from '@codm/contracts-typescript/wire/enums'
import { MCP_SERVER_KEY_PATTERN } from '../entities/McpServer'

/**
 * O PARSER DE CONFIGURAÇÃO MCP EXISTENTE — puro, sem I/O, sem DI.
 *
 * A pureza não é elegância, é o conserto de um erro de método que este repo pagou caro duas vezes na
 * mesma semana: o detector que mentia no Windows e o teardown que só falhava no POSIX. Nos dois casos
 * a lógica só era alcançável através da plataforma, então a plataforma onde ela importava era a única
 * onde ela nunca era exercitada. Aqui o disco é porta (`McpConfigDiscovery`) e ISTO é texto entrando
 * e estrutura saindo — as sete formas medidas viram sete testes que rodam em qualquer host.
 *
 * REJEIÇÃO É CIDADÃ DE PRIMEIRA CLASSE. Nada é descartado em silêncio. Um import que engole o que não
 * entende produz o pior resultado possível: o dono vê 2 de 3 servidores e conclui que o terceiro
 * nunca existiu. Toda entrada recusada sai daqui com motivo nomeado E o nome ORIGINAL, para a tela
 * poder mostrar os dois lados.
 */

/** Um servidor que PODE ser registrado. Segredos já não existem aqui — ver `secretKeysOf`. */
export interface McpImportCandidate {
	key: string
	transport: McpTransport
	command?: string
	args?: string[]
	url?: string
	/** Só os NOMES das variáveis. O valor é descartado na entrada, não na camada seguinte. */
	envKeys: string[]
	/** Só os NOMES dos headers, pelo mesmo motivo. */
	headerKeys: string[]
}

export interface McpImportRejectionItem {
	/** O nome COMO ESTAVA no arquivo — nunca normalizado. O dono precisa reconhecer o que foi recusado. */
	key: string
	reason: McpImportRejection
	/** Contexto legível quando o motivo sozinho não basta (o transporte recusado, por exemplo). */
	detail?: string
}

export interface McpImportParse {
	candidates: McpImportCandidate[]
	rejections: McpImportRejectionItem[]
}

/**
 * DUAS FORMAS DE DOCUMENTO, medidas em 04/09/2026 — não uma.
 *
 *   A) `{ mcpServers: {...} }`                              → .mcp.json, claude_desktop_config.json, colado
 *   B) `{ projects: { "<caminho>": { mcpServers: {...} } } }` → ~/.claude.json
 *
 * A forma B foi a surpresa: `~/.claude.json` NÃO tem `mcpServers` no topo. São 19 projetos nesta
 * máquina, e a configuração de cada um pende do caminho absoluto dele.
 */
interface McpDocument {
	mcpServers?: Record<string, unknown>
	projects?: Record<string, { mcpServers?: Record<string, unknown> } | undefined>
}

/**
 * Compara dois caminhos absolutos como o SISTEMA os compararia, não como bytes.
 *
 * MEDIDO: a chave de projeto no `~/.claude.json` desta máquina Windows é
 * `C:/Users/detup/Desktop/ranking_msc` — BARRA NORMAL — enquanto o `workspacePath` que a thread
 * carrega é `C:\Users\detup\Desktop\Work`, com barra invertida. Comparar as duas strings cruas
 * responde "nenhum projeto casou" para TODO workspace do Windows, e o import viria vazio sem erro
 * nenhum — o pior tipo de falha, a que parece sucesso.
 *
 * O case também importa: Windows não distingue maiúsculas em caminho. Um `c:\users\...` digitado pelo
 * dono e um `C:/Users/...` escrito pelo CLI são o mesmo diretório.
 */
function samePath(a: string, b: string): boolean {
	const normalize = (p: string): string => p.split('\\').join('/').replace(/\/+$/, '').toLowerCase()
	return normalize(a) === normalize(b)
}

/** Os nomes das chaves de um record de segredos, sem NENHUM valor. */
function secretKeysOf(value: unknown): string[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return []
	return Object.keys(value as Record<string, unknown>)
}

function asStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

/**
 * O transporte declarado, ou STDIO quando o campo está AUSENTE.
 *
 * MEDIDO: dos três servidores reais no `~/.claude.json` desta máquina, um (`supermemory`) não declara
 * `type` nenhum — só `command` e `args`. Exigir o campo descartaria o PRIMEIRO servidor da lista real
 * do dono. A ausência significa stdio, e é assim que o ecossistema inteiro a lê.
 *
 * Devolve `null` para um transporte que existe no mundo e não no nosso contrato (`sse` é o caso real),
 * porque a diferença entre "não sei ler" e "sei ler e é HTTP" é a diferença entre uma rejeição visível
 * e um servidor que some.
 */
function transportOf(raw: Record<string, unknown>): McpTransport | null {
	const declared = typeof raw.type === 'string' ? raw.type.toLowerCase() : undefined
	if (declared === undefined) return McpTransport.STDIO
	if (declared === 'stdio') return McpTransport.STDIO
	// `http` e `streamable-http` nomeiam o mesmo transporte em gerações diferentes do ecossistema.
	if (declared === 'http' || declared === 'streamable-http') return McpTransport.HTTP
	return null
}

/**
 * Lê um documento de configuração MCP e separa o que dá para registrar do que não dá.
 *
 * `workspacePath` só é consultado para a forma B — é ele que escolhe QUAL projeto do `~/.claude.json`
 * interessa. Ausente, a forma B não rende candidato nenhum (e isso é correto: importar a configuração
 * de um projeto que não é o do dono seria pior que não importar nada).
 *
 * `alreadyRegistered` entra por parâmetro em vez de ser consultado aqui: manter o parser puro é o que
 * o torna testável sem banco, e "já existe" é fato do repositório, não do documento.
 */
export function parseMcpDocument(
	raw: string,
	options: { workspacePath?: string; alreadyRegistered?: readonly string[] } = {},
): McpImportParse {
	let doc: McpDocument
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('não é um objeto')
		doc = parsed as McpDocument
	} catch {
		// UMA rejeição, nunca uma exceção. Um JSON quebrado colado na tela não pode derrubá-la.
		return { candidates: [], rejections: [{ key: '', reason: McpImportRejection.MALFORMED }] }
	}

	const servers = collectServers(doc, options.workspacePath)
	const taken = new Set((options.alreadyRegistered ?? []).map(key => key.toLowerCase()))
	const candidates: McpImportCandidate[] = []
	const rejections: McpImportRejectionItem[] = []

	for (const [key, value] of servers) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			rejections.push({ key, reason: McpImportRejection.MALFORMED })
			continue
		}
		const entry = value as Record<string, unknown>

		const transport = transportOf(entry)
		if (transport === null) {
			rejections.push({
				key,
				reason: McpImportRejection.UNSUPPORTED_TRANSPORT,
				detail: String(entry.type),
			})
			continue
		}

		// A chave é checada DEPOIS do transporte de propósito: um `sse` com nome inválido é, antes de
		// tudo, um transporte que não sabemos falar — renomeá-lo não o tornaria importável.
		if (!MCP_SERVER_KEY_PATTERN.test(key)) {
			rejections.push({ key, reason: McpImportRejection.INVALID_KEY })
			continue
		}
		if (taken.has(key.toLowerCase())) {
			rejections.push({ key, reason: McpImportRejection.ALREADY_REGISTERED })
			continue
		}

		if (transport === McpTransport.STDIO) {
			const command = typeof entry.command === 'string' ? entry.command.trim() : ''
			if (!command) {
				rejections.push({ key, reason: McpImportRejection.MISSING_COMMAND })
				continue
			}
			candidates.push({
				key,
				transport,
				command,
				args: asStringArray(entry.args),
				envKeys: secretKeysOf(entry.env),
				headerKeys: [],
			})
			continue
		}

		const url = typeof entry.url === 'string' ? entry.url.trim() : ''
		if (!url) {
			rejections.push({ key, reason: McpImportRejection.MISSING_URL })
			continue
		}
		candidates.push({ key, transport, url, envKeys: [], headerKeys: secretKeysOf(entry.headers) })
	}

	return { candidates, rejections }
}

/** As entradas de servidor do documento, nas duas formas, já achatadas em pares `[key, valor]`. */
function collectServers(doc: McpDocument, workspacePath?: string): [string, unknown][] {
	const direct = Object.entries(doc.mcpServers ?? {})
	if (direct.length > 0 || !doc.projects) return direct

	if (!workspacePath) return []
	const match = Object.entries(doc.projects).find(([path]) => samePath(path, workspacePath))
	return Object.entries(match?.[1]?.mcpServers ?? {})
}
