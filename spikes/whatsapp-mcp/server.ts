/**
 * Spike: servidor MCP (Streamable HTTP) que expõe as mensagens de WhatsApp do codm, SÓ LEITURA.
 *
 *   tools:    list_chats, list_new_messages(since_cursor), get_conversation
 *   resource: whatsapp://inbox — assinável; emite notifications/resources/updated quando chega mensagem
 *
 * Não envia nada, não fala com o gateway Go (porta 3032), não escreve no banco.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { InboxReader } from './db'

export const INBOX_URI = 'whatsapp://inbox'

export interface Config {
	dbPath: string
	token: string
	port: number
	hostname: string
	pollMs: number
}

interface Session {
	transport: WebStandardStreamableHTTPServerTransport
	mcp: McpServer
	subscribed: boolean
}

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] })
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false }

function buildMcp(reader: InboxReader, session: Pick<Session, 'subscribed'>): McpServer {
	const mcp = new McpServer(
		{ name: 'codm-whatsapp', version: '0.0.1' },
		{ capabilities: { resources: { subscribe: true, listChanged: false } } },
	)

	mcp.registerTool(
		'list_chats',
		{
			description: 'Lista as conversas de WhatsApp com mensagem mais recente primeiro (nome, se é grupo, não lidas).',
			inputSchema: { limit: z.number().int().min(1).max(200).default(30) },
			annotations: readOnly,
		},
		async ({ limit }) => json(reader.listChats(limit)),
	)

	mcp.registerTool(
		'list_new_messages',
		{
			description:
				'Mensagens que chegaram depois do cursor, em ordem de chegada. Sem since_cursor devolve as mais recentes. ' +
				'Guarde o next_cursor e passe na próxima chamada para receber só o que é novo. Por padrão só mensagens recebidas.',
			inputSchema: {
				since_cursor: z.string().optional(),
				limit: z.number().int().min(1).max(200).default(50),
				include_sent: z.boolean().default(false),
			},
			annotations: readOnly,
		},
		async ({ since_cursor, limit, include_sent }) =>
			json(reader.newMessages({ since: since_cursor, limit, includeSent: include_sent })),
	)

	mcp.registerTool(
		'get_conversation',
		{
			description: 'Últimas mensagens de uma conversa (chat_id vem de list_chats ou list_new_messages), em ordem cronológica.',
			inputSchema: { chat_id: z.string().min(1), limit: z.number().int().min(1).max(200).default(30) },
			annotations: readOnly,
		},
		async ({ chat_id, limit }) => json(reader.conversation(chat_id, limit)),
	)

	mcp.registerResource(
		'inbox',
		INBOX_URI,
		{
			title: 'Caixa de entrada do WhatsApp',
			description: 'Últimas mensagens recebidas. Assine para receber notifications/resources/updated quando chegar mensagem nova.',
			mimeType: 'application/json',
		},
		async uri => ({
			contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(reader.newMessages({ limit: 20, includeSent: false })) }],
		}),
	)

	mcp.server.setRequestHandler(SubscribeRequestSchema, async req => {
		if (req.params.uri === INBOX_URI) session.subscribed = true
		return {}
	})
	mcp.server.setRequestHandler(UnsubscribeRequestSchema, async req => {
		if (req.params.uri === INBOX_URI) session.subscribed = false
		return {}
	})

	return mcp
}

/** Token no caminho (`/mcp/<token>`) ou `Authorization: Bearer <token>` em `/mcp`. */
function authorized(req: Request, token: string): boolean {
	const url = new URL(req.url)
	const candidates = [
		url.pathname.startsWith('/mcp/') ? url.pathname.slice('/mcp/'.length) : null,
		url.pathname === '/mcp' ? (req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? null) : null,
	]
	const expected = Buffer.from(token)
	return candidates.some(c => c != null && Buffer.byteLength(c) === expected.length && timingSafeEqual(Buffer.from(c), expected))
}

export function startServer(cfg: Config) {
	const reader = new InboxReader(cfg.dbPath)
	const sessions = new Map<string, Session>()

	async function handle(req: Request): Promise<Response> {
		const path = new URL(req.url).pathname
		if (path === '/health') return new Response('ok')
		if (!authorized(req, cfg.token)) return new Response('not found', { status: 404 })

		const sessionId = req.headers.get('mcp-session-id')
		if (sessionId) {
			const s = sessions.get(sessionId)
			// 404 numa sessão desconhecida é o sinal do spec para o cliente reinicializar.
			return s ? s.transport.handleRequest(req) : new Response('unknown session', { status: 404 })
		}

		// Sem sessão: só um `initialize` é válido; o próprio transport recusa o resto com 400.
		const session = { subscribed: false } as Session
		session.transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: id => {
				sessions.set(id, session)
			},
			onsessionclosed: id => {
				sessions.delete(id)
			},
		})
		session.mcp = buildMcp(reader, session)
		await session.mcp.connect(session.transport)
		return session.transport.handleRequest(req)
	}

	const http = Bun.serve({
		port: cfg.port,
		hostname: cfg.hostname,
		idleTimeout: 0, // o stream SSE (GET) fica aberto; o transport manda keep-alive a cada 15 s
		fetch: handle,
	})

	// Poller: olha o banco a cada pollMs e acorda quem assinou o inbox.
	let lastRowid = reader.maxRowid()
	const timer = setInterval(() => {
		try {
			const max = reader.maxRowid()
			if (max < lastRowid) lastRowid = max // VACUUM renumerou: re-baseline
			if (!reader.hasInboundAfter(lastRowid)) {
				lastRowid = max
				return
			}
			lastRowid = max
			for (const s of sessions.values()) {
				if (s.subscribed) s.mcp.server.sendResourceUpdated({ uri: INBOX_URI }).catch(() => {})
			}
		} catch (err) {
			console.error('poll falhou:', err)
		}
	}, cfg.pollMs)

	return {
		url: `http://${http.hostname}:${http.port}`,
		sessions,
		async stop() {
			clearInterval(timer)
			for (const s of sessions.values()) await s.transport.close().catch(() => {})
			http.stop(true)
			reader.close()
		},
	}
}

if (import.meta.main) {
	const token = process.env.MCP_TOKEN ?? ''
	if (token.length < 32) {
		console.error('MCP_TOKEN é obrigatório (32+ caracteres). Gere com: openssl rand -hex 32')
		process.exit(1)
	}
	const dbPath = process.env.CODM_DB ?? join(homedir(), 'Library/Application Support/app.codm.desktop/data/codm.db')
	const srv = startServer({
		dbPath,
		token,
		port: Number(process.env.PORT ?? 3940),
		hostname: process.env.HOST ?? '127.0.0.1',
		pollMs: Number(process.env.POLL_MS ?? 5000),
	})
	console.log(`codm-whatsapp MCP em ${srv.url}/mcp/<token> (banco: ${dbPath}, só leitura)`)
}
