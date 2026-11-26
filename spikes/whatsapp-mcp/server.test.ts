import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js'
import { addReceived, createSeedDb } from './seed'
import { INBOX_URI, startServer } from './server'

const TOKEN = 'a'.repeat(40)
const dbPath = join(mkdtempSync(join(tmpdir(), 'wa-mcp-')), 'codm.db')
let srv: ReturnType<typeof startServer>
let client: Client

const call = async (name: string, args: Record<string, unknown> = {}) => {
	const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[] }
	return JSON.parse(res.content[0]!.text)
}

beforeAll(async () => {
	createSeedDb(dbPath)
	srv = startServer({ dbPath, token: TOKEN, port: 0, hostname: '127.0.0.1', pollMs: 100 })
	client = new Client({ name: 'test', version: '0' })
	await client.connect(new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp/${TOKEN}`)))
})

afterAll(async () => {
	await client.close()
	await srv.stop()
})

test('token errado não chega no MCP', async () => {
	expect((await fetch(`${srv.url}/mcp/errado`, { method: 'POST' })).status).toBe(404)
	expect((await fetch(`${srv.url}/mcp`, { method: 'POST' })).status).toBe(404)
})

test('expõe só as 3 ferramentas de leitura', async () => {
	const { tools } = await client.listTools()
	expect(tools.map(t => t.name).sort()).toEqual(['get_conversation', 'list_chats', 'list_new_messages'])
	expect(tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true)
})

test('list_chats', async () => {
	const chats = await call('list_chats')
	expect(chats.map((c: any) => c.name)).toEqual(['Alice', 'Time BK'])
	expect(chats[1].is_group).toBe(true)
})

test('list_new_messages: bootstrap, cursor e só recebidas', async () => {
	const first = await call('list_new_messages')
	// 3 recebidas (a enviada fica de fora); a do histórico vem por último porque foi OBSERVADA por último
	expect(first.messages.map((m: any) => m.text)).toEqual(['Oi, tudo bem?', 'Deploy saiu?', 'mensagem antiga do histórico'])
	expect(first.messages[1].chat_name).toBe('Time BK')
	expect(first.messages[1].sender_name).toBe('Alice')

	const empty = await call('list_new_messages', { since_cursor: first.next_cursor })
	expect(empty.messages).toEqual([])
	expect(empty.next_cursor).toBe(first.next_cursor)

	addReceived(dbPath, 'chegou agora')
	const next = await call('list_new_messages', { since_cursor: first.next_cursor })
	expect(next.messages.map((m: any) => m.text)).toEqual(['chegou agora'])

	const withSent = await call('list_new_messages', { include_sent: true, limit: 10 })
	expect(withSent.messages.some((m: any) => m.direction === 'SENT')).toBe(true)
})

test('get_conversation', async () => {
	const msgs = await call('get_conversation', { chat_id: '5583999990001@s.whatsapp.net' })
	expect(msgs.map((m: any) => m.direction)).toContain('SENT')
	expect(msgs[0].text).toBe('mensagem antiga do histórico') // ordem cronológica por occurred_at
})

test('resource whatsapp://inbox: subscribe recebe notifications/resources/updated', async () => {
	const read = await client.readResource({ uri: INBOX_URI })
	expect(JSON.parse((read.contents[0] as { text: string }).text).messages.length).toBeGreaterThan(0)

	const updated = new Promise<string>(resolve =>
		client.setNotificationHandler(ResourceUpdatedNotificationSchema, n => resolve(n.params.uri)),
	)
	await client.subscribeResource({ uri: INBOX_URI })
	await Bun.sleep(300) // deixa o GET SSE abrir e o poller fixar a linha de base
	addReceived(dbPath, 'notifica isso')
	const uri = await Promise.race([updated, Bun.sleep(3000).then(() => 'timeout')])
	expect(uri).toBe(INBOX_URI)
})
