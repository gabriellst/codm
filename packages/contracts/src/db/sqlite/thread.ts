import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
	ProviderKind,
	AgentModelId,
	ContactKind,
	ThreadStatus,
	BufferSize,
	TranscriptKind,
	ClassificationMethod,
	StopKind,
	StopResolution,
	DayOfWeek,
	Language,
	LoopScheduleKind,
	MessageType,
	PanelActionKind,
	PanelActionOutcome,
	GroupOutputMode,
	IssueSignalLevel,
	OutputRouting,
	BatchStatus,
} from '../../../generated/typescript/src/wire/enums'
import { enumCheck } from './_enum'

/**
 * `thread` (pgSchema namespace) → `thread_*` table prefix. SQLite-dialect mirror of
 * db/schema/thread.ts. Thread aggregate (flattened ContactRef / MentionGate VOs,
 * embedded participants + providers), the transcript, the exactly-once inbound
 * ledger, and the router's pending clarifications. pg `text[]` (providers) and pg
 * jsonb (participants, candidate_issue_ids) → sqlite `text { mode: 'json' }`.
 */

type ThreadParticipant = {
	participantId: string
	name: string
	source: string
	canInvoke: boolean
	canElevate: boolean
}

export const threads = sqliteTable(
	'thread_threads',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		channelId: text('channel_id').notNull(),

		// ContactRef VO (flattened).
		contactExternalId: text('contact_external_id').notNull(),
		contactDisplayName: text('contact_display_name').notNull(),
		contactKind: text('contact_kind').$type<ContactKind>().notNull(),

		workspaceId: text('workspace_id').notNull(),
		// pg text[] (ProviderKind[]) → sqlite json.
		providers: text('providers', { mode: 'json' }).$type<ProviderKind[]>().notNull(),

		paused: integer('paused', { mode: 'boolean' }).notNull().default(false),
		// MentionGate discriminated-union VO (flattened): tag present iff enabled.
		mentionGateEnabled: integer('mention_gate_enabled', { mode: 'boolean' }).notNull().default(false),
		mentionGateTag: text('mention_gate_tag'),
		/**
		 * Per-thread toggle for the "Pensando" placeholder (thinking-indicator spec, per-thread setting).
		 * `DEFAULT 1` — the current always-on behaviour — so every pre-existing row keeps opening the
		 * placeholder exactly as it does today; only a thread the operator explicitly turns it off for
		 * degrades to the "no placeholder" path `RunOrchestratorTurn` already has for a channel that
		 * cannot edit (mirrors that same silent degradation rather than inventing a second one).
		 *
		 * `beginTypingPresence` ("digitando…") and the console spinner are UNAFFECTED — this column gates
		 * only the phase-message sent/edited on the channel, nothing else in the turn.
		 */
		thinkingIndicatorEnabled: integer('thinking_indicator_enabled', { mode: 'boolean' }).notNull().default(true),
		/**
		 * Per-thread toggle for the 👀/🤖 channel reaction cues (reactions/streaming spec, per-thread
		 * setting) — whether `IngestChannelMessage` reacts to an invocable inbound with `CUE_ACKNOWLEDGED` and
		 * whether `DeliverChannelMessage.recordOutbound` reacts to its own finished reply with
		 * `CUE_REPLIED`.
		 *
		 * `DEFAULT 1` — the current always-on behaviour — so every pre-existing row keeps reacting exactly
		 * as it does today; only a thread the operator explicitly turns this off for stops emitting either
		 * cue. The mailbox item / transcript entry / delivered message are all UNAFFECTED — this column
		 * gates only the emoji reaction commands, nothing about whether the content itself is delivered.
		 */
		reactionsEnabled: integer('reactions_enabled', { mode: 'boolean' }).notNull().default(true),
		/**
		 * Per-thread toggle for INTERMEDIATE content cuts (reactions/streaming spec, per-thread setting) —
		 * whether `RunOrchestratorTurn` calls `decideCut`/`streamed.cut` while the model is still working.
		 *
		 * `DEFAULT 1` — the current always-on behaviour — so every pre-existing row keeps streaming exactly
		 * as it does today. When OFF, no intermediate cut is ever sent: if `thinkingIndicatorEnabled` is
		 * also ON, the "Pensando" placeholder is edited to the final text at the end of the turn (one
		 * message, not two); if it is also OFF, the turn falls through to a single plain send — exactly
		 * today's non-streaming/non-indicator behaviour. See `RunOrchestratorTurn`'s streaming-off gate for
		 * the full interaction with the thinking-indicator gate.
		 */
		streamingEnabled: integer('streaming_enabled', { mode: 'boolean' }).notNull().default(true),
		/**
		 * O IDIOMA DESTA CONVERSA — declarado, nunca detectado (i18n-das-pistas spec, decisão 2).
		 *
		 * NULL ⟺ "o operador não escolheu para esta conversa", e nesse caso vale o padrão do dono (o
		 * idioma da conta, `Session.user.language`). Nulável em vez de `NOT NULL DEFAULT 'pt-BR'` porque
		 * "nunca escolhi" e "escolhi português" NÃO são o mesmo fato: com o default gravado, trocar o
		 * idioma da conta deixaria de alcançar as conversas que só herdavam — cada linha antiga teria
		 * congelado uma escolha que ninguém fez. Mesma regra que `custom_prompt` ao lado declara: uma
		 * ausência tem UMA grafia.
		 *
		 * DECLARADO é o ponto: nada aqui é inferido do transcript. Uma linha em inglês num grupo
		 * português não vira uma coluna diferente no meio do turno — as pistas de fase são vistas por
		 * todos na sala, e trocar de idioma a cada mensagem seria pior que estar no idioma errado.
		 *
		 * Sem CHECK, ao contrário dos enums vizinhos: SQLite não sabe ADICIONAR uma constraint de tabela
		 * a uma tabela existente, então declarar um `enumCheck` aqui faria o drizzle-kit emitir um
		 * recreate destrutivo de `thread_threads` no lugar de um `ALTER TABLE ADD COLUMN` aditivo. Quem
		 * fecha o conjunto é o `z.enum(Language)` do agregado, na hidratação (`LibSqlThreadRepository`).
		 */
		language: text('language').$type<Language>(),
		/**
		 * HOW MUCH OF WHAT ITS ISSUES SAY REACHES THIS GROUP (fase 3, item 2) — `GroupOutputMode`, read by the
		 * output policy's total table (`ROUTING_BY_MODE`). `NOT NULL DEFAULT 'DECISIONS_AND_LIVE'`: the owner
		 * decided (18/11) that existing and new groups alike start there, so every pre-existing row backfills
		 * to the decided default and there is no "never chosen" spelling to keep apart.
		 *
		 * Sem CHECK, pelo mesmo motivo de `language` acima: SQLite não ADICIONA constraint a tabela existente,
		 * e um `enumCheck` aqui faria o drizzle-kit reconstruir `thread_threads` em vez de um `ADD COLUMN`
		 * aditivo. Quem fecha o conjunto é o `z.enum(GroupOutputMode)` do agregado, na hidratação.
		 */
		outputMode: text('output_mode').$type<GroupOutputMode>().notNull().default(GroupOutputMode.DECISIONS_AND_LIVE),
		participants: text('participants', { mode: 'json' }).$type<ThreadParticipant[]>().notNull(),
		// BufferSize string tiers (25 | 50 | 100 | 200).
		bufferSize: text('buffer_size').$type<BufferSize>().notNull(),

		/**
		 * WHICH MODEL this conversation asks each of its CLIs for — a PARTIAL map, `{}` until chosen.
		 *
		 * A map and not a single column because the choice is per PROVIDER: `providers` is an array, and
		 * `opus` is vocabulary of one binary, so a lone `model` column would hold a value that is right for
		 * at most one of the CLIs the thread declares and silently wrong for the rest. The catalog of what
		 * each provider offers is declared once in `packages/api/typescript/src/catalog/agent-models.ts`.
		 *
		 * PARTIAL, and that is the invariant: an entry is written only for a NON-default choice.
		 * `AgentModelId.DEFAULT` means "omit `--model`, let the CLI pick", which is exactly what an absent
		 * key already means — so `Thread.configureModel(p, DEFAULT)` DELETES the key rather than storing it.
		 * Two spellings of one fact is the defect `custom_prompt` above documents; this column refuses to
		 * repeat it.
		 *
		 * `NOT NULL DEFAULT '{}'` for the same reason: null would be a third spelling of "nothing chosen".
		 * Every pre-existing row backfills to the empty map, which is what those threads already behave as.
		 */
		modelByProvider: text('model_by_provider', { mode: 'json' }).$type<Partial<Record<ProviderKind, AgentModelId>>>().notNull().default({}),

		/**
		 * The operator's own standing instructions for THIS conversation — null while unset.
		 *
		 * Nullable rather than `NOT NULL DEFAULT ''` because "the operator never wrote one" and "the
		 * operator wrote an empty one" are the same fact, and only one of them should be representable:
		 * the prompt builder renders the section iff there is text, so a stored `''` would be a second
		 * spelling of absent that every reader has to remember to normalize.
		 */
		customPrompt: text('custom_prompt'),

		// ThreadStatus (RUNNING | IDLE | NEEDS_ATTENTION | PAUSED).
		status: text('status').$type<ThreadStatus>().notNull(),

		/**
		 * SOFT DELETE (thread-deletion spec, decision 1) — null while the conversation is configured.
		 *
		 * A nullable timestamp rather than a boolean: "when" is the audit question the row must answer,
		 * and the whole feature is defined by rows that STAY. No child is deleted, so the transcript,
		 * issues, stops and artifacts of an apagada thread remain in the database while every console
		 * read filters on `deleted_at IS NULL` (decision 5).
		 *
		 * Deliberately NOT part of `threads_owner_channel_contact_unq`. That unique index is exactly what
		 * makes re-attach REVIVE this row (decision 4) instead of inserting a second one; admitting a
		 * duplicate for a deleted row would give one contact two transcripts and lose the "mesma conversa"
		 * property the decision names.
		 */
		deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('thread_threads_contact_kind_check', t.contactKind, Object.values(ContactKind)),
		enumCheck('thread_threads_buffer_size_check', t.bufferSize, Object.values(BufferSize)),
		enumCheck('thread_threads_status_check', t.status, Object.values(ThreadStatus)),
		index('threads_owner_id_idx').on(t.ownerId),
		uniqueIndex('threads_owner_channel_contact_unq').on(t.ownerId, t.channelId, t.contactExternalId),
		index('threads_workspace_id_idx').on(t.workspaceId),
	],
)

export const transcriptEntries = sqliteTable(
	'thread_transcript_entries',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),

		// TranscriptKind (CONTACT | SYSTEM | DIRECT | WHISPER | ACTION).
		kind: text('kind').$type<TranscriptKind>().notNull(),
		text: text('text').notNull(),

		issueId: text('issue_id'),
		quotedEntryId: text('quoted_entry_id'),
		senderExternalId: text('sender_external_id'),

		/**
		 * WHICH LOOP fired this whisper — NULL ⟺ a human typed it.
		 *
		 * A `WHISPER` is the operator instructing the agents without the room seeing it, and until this
		 * column existed a scheduled one was indistinguishable from a typed one: both landed with no
		 * sender, both rendered to the model as `operator`, and the agent answered a timer as if somebody
		 * had just spoken. The prompt grammar reads this to write `de="loop:<label>"` instead.
		 *
		 * It stores the loop's LABEL (derived from its schedule — `09:00 mon,wed,fri`, `every 15min`),
		 * denormalized at fire time rather than a foreign key. A transcript records what happened: a loop
		 * edited to another hour, or deleted, must not rewrite who spoke yesterday.
		 *
		 * Its ONE writer is `SteerThread`, which only ever records `WHISPER` — so "only a whisper carries
		 * a loop" holds by construction rather than by a validator.
		 */
		firedByLoop: text('fired_by_loop'),

		// ProviderKind — present for kind AGENT.
		provider: text('provider').$type<ProviderKind>(),
		// ClassificationMethod — present on ACTION lines.
		classification: text('classification').$type<ClassificationMethod>(),

		/**
		 * MessageType of the channel message behind a CONTACT entry — NULL for TEXT (the overwhelming
		 * default) and for every non-channel kind. Only media entries (IMAGE | VIDEO | AUDIO | DOCUMENT |
		 * STICKER) carry it, so the prompt grammar can say `tipo="audio"` without parsing the text.
		 */
		messageType: text('message_type').$type<MessageType>(),
		/**
		 * Absolute path of the downloaded media in the shared data dir (`<dataDir>/media/<sha256>.<ext>`),
		 * written by the Go gateway at receive time. The agent reads the file with its own tools — the
		 * platform's job ends at handing over this path. NULL when the download failed or on TEXT entries;
		 * the entry then degrades to its placeholder text.
		 *
		 * Also carries the OUTBOUND direction (`SendArtifact` — "envio de artefatos pelo canal" design):
		 * the staged copy of the artifact under the SAME media dir, so a SYSTEM entry that delivered an
		 * artifact to the contact reads through the identical column an inbound download uses. Which
		 * direction a row is in is `kind` (CONTACT vs SYSTEM), not a second column.
		 */
		mediaPath: text('media_path'),
		/**
		 * The artifact this SYSTEM entry delivered to the contact ("envio de artefatos pelo canal"
		 * design, decision 4/8) — NULL on every other entry. No FK: `artifact_registry_artifacts` and
		 * `thread_transcript_entries` are siblings under the same aggregate boundary (BC6/B4), and a
		 * cross-table FK inside one SQLite file buys nothing a same-transaction write doesn't already
		 * guarantee. Lets the console render the artifact bubble on the agent's side of the transcript
		 * from the entry alone, the same join shape `mediaPath` already established for inbound media.
		 */
		artifactId: text('artifact_id'),

		/**
		 * FASE 3 — what an issue said, and where the output policy sent it. All NULL on every entry that is
		 * not an issue's own signal (a contact's message, the orchestrator's reply, a whisper…).
		 *
		 * `level` is the `IssueSignalLevel` of the signal; `routing` the `OutputRouting` the group's mode gave
		 * it (GROUP = sent as its own message, DIGEST = waiting for / folded into a per-person digest, PANEL =
		 * never sent). No CHECK on either, for the same reason as `thread_threads.language`: a table-level
		 * constraint on an existing table makes drizzle-kit REBUILD it (this one is the biggest table in the
		 * file) instead of an additive `ADD COLUMN`; the aggregate's `z.enum` closes the set on hydration.
		 */
		level: text('level').$type<IssueSignalLevel>(),
		routing: text('routing').$type<OutputRouting>(),
		/** The stop (an ask) this entry put to the group — the anchor a quoted reply resolves. */
		stopId: text('stop_id'),
		/** The digest entry that carried this one to the group, when it was folded into a per-person digest. */
		digestEntryId: text('digest_entry_id'),
		/** Who the signal is addressed to (a participant id) — the key the digest groups by. */
		addresseeId: text('addressee_id'),

		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		enumCheck('thread_transcript_entries_kind_check', t.kind, Object.values(TranscriptKind)),
		enumCheck('thread_transcript_entries_provider_check', t.provider, Object.values(ProviderKind)),
		enumCheck('thread_transcript_entries_classification_check', t.classification, Object.values(ClassificationMethod)),
		enumCheck('thread_transcript_entries_message_type_check', t.messageType, Object.values(MessageType)),
		index('transcript_entries_thread_at_idx').on(t.threadId, t.at),
		index('transcript_entries_issue_id_idx').on(t.issueId),
		// The digest flush: "the DIGEST entries of this thread not yet carried by a digest".
		index('transcript_entries_digest_idx').on(t.threadId, t.routing, t.digestEntryId),
	],
)

/**
 * `issue_stops` — the human-in-the-loop stops. Defined HERE, in the thread schema, because a Stop is a
 * CHILD OF THE THREAD aggregate since B4 (spec decision 4): `Thread.raiseStop` / `Thread.resolveStop`
 * are the only writers, and `ThreadRepository.save` persists them in the thread's transaction.
 *
 * ### The physical name stays `issue_stops` (B4, decision D-A)
 * Ownership is expressed by this file, not by the prefix. The rename is a separate front: the Go side
 * reads this table from THREE hand-written sqlc query files (`core/db/sqlite/query/{issue,thread,ui}.sql`,
 * one of them an `UPDATE`) plus six generated ones, and drizzle-kit cannot infer a table rename — it
 * emits DROP + CREATE and, under `strict: true`, asks. The Drizzle symbol (`stops`) and the index names
 * (`stops_*_idx`) were already prefix-free, so nothing in TS reads the physical name at all.
 *
 * `issue_id` is NULLABLE (B4, spec decision 4). That is the whole point of the migration: a stop can be
 * raised at THREAD level — the orchestrator's needs-approval, before any issue exists — which was
 * unreachable while `RaiseStopInputSchema`/`AskOperatorInputSchema` demanded an `issueId`. Additive: no
 * backfill, every existing row already has one.
 */
export const stops = sqliteTable(
	'issue_stops',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		issueId: text('issue_id'),
		threadId: text('thread_id').notNull(),

		// StopKind (SERVER_ERROR | BLOCKED_BY_CLASSIFICATION | HUMAN_REQUESTED | APPROVAL_NEEDED | AUTH_REQUIRED).
		kind: text('kind').$type<StopKind>().notNull(),
		title: text('title').notNull(),
		detail: text('detail').notNull(),
		raisedAt: integer('raised_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),

		// StopResolution (must match the kind) — null while open.
		resolution: text('resolution').$type<StopResolution>(),
		resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),

		/**
		 * FASE 3 — the ASK of a DECISION_REQUESTED / QUESTION_ASKED stop; every column NULL on the other kinds.
		 *
		 * `ask` / `answer` are JSON whose shape is owned by the TS core (`StopAskSchema` / `StopAnswerSchema`
		 * in `@shared/objects`) and parsed on hydration — no type is redeclared here. `answered_by` is the
		 * participant id of whoever answered (NULL when the default applied). `seq` numbers the asks PER
		 * ISSUE — the `D1` of `APP-12 · D1` — read as `max(seq)+1` inside the raising transaction, with the
		 * unique index below refusing the race (NULL seqs of the non-ask stops never collide in SQLite).
		 * `due_at` is set ONCE, when the message carrying a question is accepted by the gateway (NULL
		 * until then, and always NULL for a decision); the deadline sweep reads it through its index.
		 * `ask_entry_id` is the transcript entry that put the ask to the group.
		 */
		ask: text('ask', { mode: 'json' }),
		answer: text('answer', { mode: 'json' }),
		answeredBy: text('answered_by'),
		seq: integer('seq'),
		dueAt: integer('due_at', { mode: 'timestamp_ms' }),
		askEntryId: text('ask_entry_id'),
	},
	t => [
		enumCheck('issue_stops_kind_check', t.kind, Object.values(StopKind)),
		enumCheck('issue_stops_resolution_check', t.resolution, Object.values(StopResolution)),
		index('stops_issue_id_idx').on(t.issueId),
		index('stops_thread_id_idx').on(t.threadId),
		uniqueIndex('stops_issue_seq_unq').on(t.issueId, t.seq),
		index('stops_due_at_idx').on(t.dueAt),
	],
)

/**
 * `thread_loops` — the recurring prompt an operator schedules INTO one conversation.
 *
 * A loop is a whisper on a timer: the same text `SteerThread` puts in the transcript, delivered by
 * the product itself when the operator's schedule says so ("toda segunda, quarta e sexta às 09:00,
 * pergunte como está o deploy", or "a cada 15 minutos, verifique se o build quebrou"). Its own table,
 * and not columns on `thread_threads`, because a conversation has MANY of them and each has its own
 * lifecycle — edit one, pause one, delete one — which a set of columns cannot express.
 *
 * ### The schedule is a DISCRIMINATED UNION, flattened
 * `kind` says which shape the row carries, and only that shape's columns are filled: `DAILY` fills
 * `time_of_day` + `weekdays` + `timezone`; `INTERVAL` fills `every_minutes`. Hence the nullability —
 * these are not optional fields of one schedule, they are the columns of two. A JSON blob would store
 * the same data and give up both the enum check and a readable row; a table per member would turn the
 * one hot question ("which loops are due?") into a join. `next_run_at` is what the sweep reads, and it
 * is the same column for both members — which is why they cost nothing to keep side by side.
 *
 * ### `next_run_at` is DERIVED, and stored anyway
 * It is `schedule.nextRunAfter(now)` and nothing else — recomputed by the aggregate on every write
 * that can move it (create, reschedule, enable, fire). It is persisted because the SWEEP has to answer
 * "which loops are due?" in SQL: with only `time_of_day` + `weekdays` + `timezone` on the row, every
 * tick would have to load every loop of every conversation and evaluate the recurrence in JS. Indexed
 * for exactly that query.
 *
 * NULL means "no next run" — the one spelling of "this loop is not scheduled", which is what
 * `enabled = false` produces. The due filter is therefore `enabled AND next_run_at <= now`, and a
 * paused loop is invisible to it by both columns.
 */
export const loops = sqliteTable(
	'thread_loops',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),

		/** What gets whispered. The operator's words, verbatim — never a template we expand. */
		prompt: text('prompt').notNull(),

		/** WHICH schedule shape this row carries — see the table docblock. */
		kind: text('kind').$type<LoopScheduleKind>().notNull().default(LoopScheduleKind.DAILY),

		// LoopSchedule DAILY member (flattened): the wall-clock time, the weekdays it repeats on, and
		// the zone those two are read in. `HH:MM` as text rather than minutes-since-midnight because it
		// is what the operator typed and what the console renders back — a number would need the same
		// conversion in three places to say the same thing. NULL on an INTERVAL row.
		timeOfDay: text('time_of_day'),
		// DayOfWeek[] — sqlite json, same convention as `threads.providers`.
		weekdays: text('weekdays', { mode: 'json' }).$type<DayOfWeek[]>(),
		/** IANA zone. 09:00 means 09:00 WHERE THE OPERATOR IS, which an instant alone cannot say. */
		timezone: text('timezone'),

		/**
		 * LoopSchedule INTERVAL member: the cadence in minutes, and nothing else. NULL on a DAILY row.
		 *
		 * No zone and no anchor stored beside it on purpose — the next run is derived from the last
		 * thing that happened to the loop (`next_run_at` below), not from a grid a timezone would be
		 * needed to place.
		 */
		everyMinutes: integer('every_minutes'),

		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),

		/** Derived — see the table docblock. Null iff the loop is disabled. */
		nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
		/** When it last actually whispered — null until the first fire. The console renders it. */
		lastFiredAt: integer('last_fired_at', { mode: 'timestamp_ms' }),

		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('thread_loops_kind_check', t.kind, Object.values(LoopScheduleKind)),
		index('loops_thread_id_idx').on(t.threadId),
		// THE SWEEP'S index — `FireDueLoops` runs every minute for as long as the daemon is up, so the
		// one query it makes must never be a table scan.
		index('loops_next_run_at_idx').on(t.nextRunAt),
	],
)

/**
 * `consumed_messages` — the BC4 inbound-message idempotency ledger. `INSERT ... ON
 * CONFLICT DO NOTHING` keyed on UNIQUE(channel_id, platform_message_id) turns
 * at-least-once delivery into exactly-once processing.
 */
export const consumedMessages = sqliteTable(
	'thread_consumed_messages',
	{
		id: text('id').primaryKey(),

		ownerId: text('owner_id').notNull(),

		channelId: text('channel_id').notNull(),
		platformMessageId: text('platform_message_id').notNull(),

		threadId: text('thread_id'),
		entryId: text('entry_id'),

		consumedAt: integer('consumed_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
	},
	t => [
		uniqueIndex('consumed_messages_channel_message_unq').on(t.channelId, t.platformMessageId),
		// The REVERSE lookup: a transcript entry → the platform id it became. Quoting the message that
		// opened an issue reads this way; the unique index above only serves the inbound direction.
		index('consumed_messages_entry_idx').on(t.entryId),
	],
)

/**
 * `panel_actions` — the daemon's LEDGER of actions people asked for on the cloud panel (fase 2, item 6b).
 *
 * Two jobs, one row per cloud action id:
 *  - the EXACTLY-ONCE latch: the row is inserted (primary key = the cloud's action id) in the SAME
 *    transaction as the pause/resume/steer/answer it records, so a pull that hands the same action again
 *    finds the row and acts on nothing;
 *  - the OUTBOX of outcomes: `reportedAt` stays null until a pull carrying the outcome succeeded, so a
 *    failed pull or a restart re-sends it instead of losing it.
 *
 * Holds no text and no address: the steer's words live in the mailbox item, the member's JID nowhere here.
 */
export const panelActionLedger = sqliteTable(
	'thread_panel_actions',
	{
		/** The cloud's action id. */
		id: text('id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),
		kind: text('kind').$type<PanelActionKind>().notNull(),
		/** DONE or REFUSED. */
		outcome: text('outcome').$type<PanelActionOutcome>().notNull(),
		/** The refusal's error code (never its message, which can carry ids). */
		outcomeCode: text('outcome_code'),
		executedAt: integer('executed_at', { mode: 'timestamp_ms' }).notNull(),
		/** When a pull carrying this outcome succeeded — null = still to report. */
		reportedAt: integer('reported_at', { mode: 'timestamp_ms' }),
	},
	t => [
		enumCheck('thread_panel_actions_kind_check', t.kind, Object.values(PanelActionKind)),
		enumCheck('thread_panel_actions_outcome_check', t.outcome, Object.values(PanelActionOutcome)),
		index('panel_actions_reported_idx').on(t.reportedAt),
	],
)

/**
 * A BATCH (fase 4, item 5): one message that listed several requests, numbered `L-<seq>` per conversation.
 * Its own aggregate (`Batch`), not a child of the `Thread`: it has its own lifecycle (INCOMPLETE until every
 * item has a destination, then RECORDED once the receipt went out) and the thread is large already.
 */
export const batches = sqliteTable(
	'thread_batches',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id').notNull(),
		threadId: text('thread_id').notNull(),
		/** What people quote (`L-31`) — `L-` + `seq`. */
		code: text('code').notNull(),
		seq: integer('seq').notNull(),
		/** The transcript entry whose message listed the items. */
		sourceEntryId: text('source_entry_id').notNull(),
		itemCount: integer('item_count').notNull(),
		status: text('status').$type<BatchStatus>().notNull(),
		/** The receipt the orchestrator posted once every item had a destination. */
		receiptEntryId: text('receipt_entry_id'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		version: integer('version').notNull().default(1),
	},
	t => [
		enumCheck('thread_batches_status_check', t.status, Object.values(BatchStatus)),
		uniqueIndex('thread_batches_thread_seq_unq').on(t.threadId, t.seq),
	],
)

/** One numbered item of a batch and its destination (`BatchItemDestinationSchema`, JSON owned by the TS core). */
export const batchItems = sqliteTable(
	'thread_batch_items',
	{
		batchId: text('batch_id').notNull(),
		n: integer('n').notNull(),
		excerpt: text('excerpt').notNull(),
		/** Null until the orchestrator recorded where this item went. */
		destination: text('destination', { mode: 'json' }),
		/** The issue the destination names, when it names one — what the issue's timeline reads (`BATCH_LINKED`). */
		issueId: text('issue_id'),
		/** When the destination was recorded — the instant of the issue's `BATCH_LINKED` timeline item. */
		recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }),
	},
	t => [primaryKey({ columns: [t.batchId, t.n] }), index('thread_batch_items_issue_idx').on(t.issueId)],
)
