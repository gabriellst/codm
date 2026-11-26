/**
 * Leitura das mensagens de WhatsApp que o gateway Go do codm já projeta no SQLite.
 *
 * Só leitura: abre o codm.db com `readonly`, nunca escreve, nunca fala com o gateway.
 * Tabelas: `gateway_messages` e `gateway_remotes` (packages/contracts/src/db/sqlite/channel.ts).
 *
 * Cursor = (observed_at, id). `observed_at` é quando o codm VIU a mensagem — o sync de histórico
 * insere mensagens com `occurred_at` antigo, então ordenar por `occurred_at` perderia mensagens.
 */
import { Database } from 'bun:sqlite'

export interface Message {
	id: string
	chat_id: string
	chat_name: string
	is_group: boolean
	direction: 'RECEIVED' | 'SENT'
	sender_id: string
	sender_name: string | null
	type: string | null
	text: string
	occurred_at: string
	observed_at: string
}

export interface Chat {
	chat_id: string
	name: string
	is_group: boolean
	unread: number
	last_message_at: string | null
}

interface Cursor {
	observedAt: number
	id: string
}

export function encodeCursor(c: Cursor): string {
	return Buffer.from(`${c.observedAt}:${c.id}`).toString('base64url')
}

export function decodeCursor(raw: string): Cursor {
	const decoded = Buffer.from(raw, 'base64url').toString()
	const sep = decoded.indexOf(':')
	const observedAt = Number(decoded.slice(0, sep))
	if (sep < 1 || !Number.isFinite(observedAt)) throw new Error('cursor inválido')
	return { observedAt, id: decoded.slice(sep + 1) }
}

/** Texto legível do conteúdo opaco (mapper/content.go): `text` no topo, `caption` nas mídias. */
function renderText(type: string | null, contentJson: string): string {
	let content: Record<string, any> = {}
	try {
		content = JSON.parse(contentJson) ?? {}
	} catch {
		// conteúdo corrompido não derruba a listagem
	}
	if (typeof content.text === 'string' && content.text !== '') return content.text
	for (const key of ['imageMessage', 'videoMessage', 'documentMessage']) {
		const caption = content[key]?.caption
		if (typeof caption === 'string' && caption !== '') return `[${type ?? key}] ${caption}`
	}
	return `[${type ?? 'UNKNOWN'}]`
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString())

// O mesmo SELECT nos três usos: mensagem + nome do chat + nome de quem mandou (contato no mesmo canal).
const MESSAGE_SELECT = `
	SELECT m.id, m.remote_id, m.direction, m.sender_remote_id, m.message_type, m.content,
	       m.occurred_at, m.observed_at,
	       r.name AS chat_name, r.type AS chat_type,
	       s.name AS sender_name
	FROM gateway_messages m
	LEFT JOIN gateway_remotes r ON r.channel_id = m.channel_id AND r.remote_id = m.remote_id
	LEFT JOIN gateway_remotes s ON s.channel_id = m.channel_id AND s.remote_id = m.sender_remote_id
	WHERE m.platform = 'WHATSAPP' AND m.deleted_at IS NULL`

interface Row {
	id: string
	remote_id: string
	direction: 'RECEIVED' | 'SENT'
	sender_remote_id: string
	message_type: string | null
	content: string
	occurred_at: number
	observed_at: number
	chat_name: string | null
	chat_type: string | null
	sender_name: string | null
}

const isGroup = (remoteId: string, type: string | null) => type === 'GROUP' || remoteId.endsWith('@g.us')

function toMessage(r: Row): Message {
	return {
		id: r.id,
		chat_id: r.remote_id,
		chat_name: r.chat_name || r.remote_id,
		is_group: isGroup(r.remote_id, r.chat_type),
		direction: r.direction,
		sender_id: r.sender_remote_id,
		sender_name: r.sender_name || null,
		type: r.message_type,
		text: renderText(r.message_type, r.content),
		occurred_at: iso(r.occurred_at)!,
		observed_at: iso(r.observed_at)!,
	}
}

export class InboxReader {
	private db: Database

	constructor(path: string) {
		this.db = new Database(path, { readonly: true })
		this.db.exec('PRAGMA busy_timeout = 5000')
	}

	close() {
		this.db.close()
	}

	listChats(limit: number): Chat[] {
		const rows = this.db
			.query<any, [number]>(
				`SELECT remote_id, name, type, unread_message_count, last_message_at
				 FROM gateway_remotes
				 WHERE platform = 'WHATSAPP' AND deleted_at IS NULL AND archived = 0 AND last_message_at IS NOT NULL
				 ORDER BY last_message_at DESC LIMIT ?`,
			)
			.all(limit)
		return rows.map(r => ({
			chat_id: r.remote_id,
			name: r.name || r.remote_id,
			is_group: isGroup(r.remote_id, r.type),
			unread: r.unread_message_count,
			last_message_at: iso(r.last_message_at),
		}))
	}

	/**
	 * Mensagens depois do cursor, em ordem cronológica de chegada.
	 * Sem cursor: as `limit` mais recentes (bootstrap) — o `next_cursor` devolvido aponta para a última.
	 */
	newMessages(opts: { since?: string; limit: number; includeSent: boolean }): { messages: Message[]; next_cursor: string | null } {
		const dir = opts.includeSent ? '' : ` AND m.direction = 'RECEIVED'`
		let rows: Row[]
		if (opts.since) {
			const c = decodeCursor(opts.since)
			rows = this.db
				.query<Row, [number, number, string, number]>(
					`${MESSAGE_SELECT}${dir} AND (m.observed_at > ? OR (m.observed_at = ? AND m.id > ?))
					 ORDER BY m.observed_at, m.id LIMIT ?`,
				)
				.all(c.observedAt, c.observedAt, c.id, opts.limit)
		} else {
			rows = this.db
				.query<Row, [number]>(`${MESSAGE_SELECT}${dir} ORDER BY m.observed_at DESC, m.id DESC LIMIT ?`)
				.all(opts.limit)
				.reverse()
		}
		const last = rows.at(-1)
		return {
			messages: rows.map(toMessage),
			next_cursor: last ? encodeCursor({ observedAt: last.observed_at, id: last.id }) : (opts.since ?? null),
		}
	}

	conversation(chatId: string, limit: number): Message[] {
		return this.db
			.query<Row, [string, number]>(`${MESSAGE_SELECT} AND m.remote_id = ? ORDER BY m.occurred_at DESC LIMIT ?`)
			.all(chatId, limit)
			.reverse()
			.map(toMessage)
	}

	/**
	 * Detecção barata de "chegou algo" para o poller: `rowid` é a chave física da tabela, então a
	 * busca por `rowid > ?` é um seek, não um scan. O rowid NÃO é o cursor público (um VACUUM pode
	 * renumerar); só serve para acordar os assinantes. Quem quer as mensagens usa o cursor.
	 */
	maxRowid(): number {
		return this.db.query<{ m: number | null }, []>('SELECT MAX(rowid) AS m FROM gateway_messages').get()?.m ?? 0
	}

	hasInboundAfter(rowid: number): boolean {
		return (
			this.db
				.query<{ x: number }, [number]>(
					`SELECT 1 AS x FROM gateway_messages
					 WHERE rowid > ? AND platform = 'WHATSAPP' AND direction = 'RECEIVED' AND deleted_at IS NULL LIMIT 1`,
				)
				.get(rowid) != null
		)
	}
}
