# Handoff — `agent-abstraction`, 28 jul 2026

## The one thing to read first

**CodeDM has never worked in production.** Not "the sent/received gap" — the entire inbound
ingestion chain has been unregistered since Fase 4.5, and the app boots healthy anyway.

`ClaudeAgentRunner`'s constructor ended in `options: ClaudeAgentRunnerOptions = {}`. tsyringe
introspects *every* constructor parameter, including a defaulted one; the emitted paramtype is
`Object`, and resolving `Object` throws `TypeInfo not known for "Object"`. `Mediator.register`
**catches** that, logs `Failed to resolve Handler …`, decrements a counter and moves on. So
`ConsumeInboundMessage` and `RunIssueTurnOnClassification` never registered. `SqlExternalMediator`
claims only outbox rows whose event name has a registered handler, so every
`integration.channel_message.received` row sat at `attempts = 0` forever — no error, no retry, no
symptom beyond silence.

Nothing caught it because nothing exercised it: `mock`/`integration` bind a stub, `CODEDM_E2E` swaps
in `E2eStubAgentRunner` (whose one parameter resolves), and the unit tests build the class by hand.
**Production was the only caller that went through the container.**

Fixed in `43a9b054`. Treat the lesson as general: a green boot and a green suite prove nothing about
DI here.

## State

- Branch `agent-abstraction`, HEAD `43a9b054`. `main` untouched at `4ac90824`. Nothing pushed.
- Working tree clean **except** `packages/app/react/src/components/console/AppChrome.tsx` — a
  founder edit (`h-11` → `h-8`), deliberately left uncommitted. Ask before touching it.
- Gates at HEAD: api-ts `tsc` 0, contracts `tsc` 0, `db:check-go` byte-identical, 39/39 runner tests.

Landed this session:

| commit | what |
|---|---|
| `38b0230e` | `bun migrate:dev` over the boot applier (same `_sqlite_migrations` ledger, not a second applier) |
| `211bf01c` | purge cargo-side copies of staged sidecar resources — stale PG migrations in `target/debug/` were killing the daemon |
| `43a9b054` | the DI fix above + 19 Drizzle extra-config callbacks migrated from the deprecated object form to arrays |

## Open work

Tasks #14–#19 carry full descriptions. Summary, with decisions already settled by the founder:

**#14 — `AgentRunnerFactory` (half done).** The boot fix landed; the factory did not.
- Shape **(A)**: abstract token bound per env in `agent/registry.ts`, *not* a single `@injectable()`
  class. The `AgentRunner` binding is also the env seam that makes "no test spawns a provider CLI" a
  property of DI (§8 rule 8); collapsing it would move env logic into a domain class. Knowingly
  departs from SVC-P13's "no registry entries" letter, keeps its spirit in the `real` impl.
- Provider travel **(2)**: `RunIssueTurn` and `DefaultIssueRouter` inject the factory, resolve the
  runner, and pass it to the agent **at call time**. Agents stop taking `runner` in the constructor;
  `Agent.run()` takes it as a parameter. Chosen over adding `provider` to `BaseAgentInputSchema`,
  which is a Fase-1 frozen contract (§4.6) guarded by `tests/architecture/agent-input.type-test.ts`,
  and over putting it on the request, which `AC-4.5.3` forbids.
- Blast radius: new factory (abstract + real injecting `ClaudeAgentRunner` concretely + stub impl);
  `types/Agent.ts`; `ClassifyIssueAgent`; `IssueWorkAgent`; `DefaultIssueRouter`; `RunIssueTurn`;
  `agent/registry.ts` (keep the existing `E2E ?` ternary shape); `src/index.ts:122`, which resolves
  the `AgentRunner` token for shutdown and must resolve the factory instead; plus tests.
- Also reword `agent/typescript/registry.yaml` bp-15 and `agent/registry.ts:86` so "NO factory"
  scopes to `AgentName`→agent resolution, not runners — otherwise `bun review` flags this work.

**#15 — done.** `extractInboundText` is gone and the call site is `payload.content?.text`. The
premise was right but the diagnosis in this section was not: the Go union-slot declarations were
never wrong. TypeScript simply cannot correlate a slot field with a sibling discriminator, so an
opaque `content: z.unknown()` could never narrow no matter how the manifest was declared — only a
union of the WHOLE payload does, and `tests/architecture/union-narrowing.typecheck.ts` had been
compiling exactly that for the SSE surface all along. The emitter now produces a SECOND
materialization, `wire/events/in-process.ts`, whose arms are built from the CONTRACT payload so
`occurredAt` stays a `Date` for an in-process handler (the wire/kubb one types it `string`, which is
right for JSON and wrong for a mediator that already revived it). See union-slots spec §2.4.1.

**#16 — `@mention` as the default gate.** `@<definedname>` citations should be created as part of the
workspace-link flow, and the agent should reply *only* to messages citing it while still receiving the
preceding message window. The mechanism already exists and is off: `thread_threads` has
`mention_gate_enabled` (0) and `mention_gate_tag` (empty, never assigned).

**#17 — links must appear in conversations with zero messages.** Related latent bug already located:
`RemoteOnMessageSentProjector → ApplyLatestMessage` is a bare `UPDATE` with no `INSERT`
(`sqlite_remote_projection_repository.go:477`), and `entities.NewRemote` — the only raiser of
`channel.remote_created` — has **zero non-test callers**, so the stub-creation path its comment
describes does not exist in production.

**#18 — done.** `sqliteTable` is *not* deprecated; its object-returning third parameter is
(`drizzle-orm@0.45.2` says so in the `.d.ts`). 19 callbacks migrated. Proven inert: `bun
migrate:create` → "No schema changes", identical migration md5s, Go embed still byte-identical.

**#19 — merge, then deep-analyse what to upstream** to `template-fullstack`: de-parameterization, the
Tauri desktop app, Astro, the skills, configuration, and the SQLite story (one shared file, two
sidecars on one WAL db, boot-time migration over one ledger, role-scoped locks, `migrate:dev`). Also
weigh the `EventHandler.ts` JSONB-reconstruction fix, stranded in codedm's fork — `template-fullstack`
and `medscall` both lack it. Deliverable is an analysis with a concrete plan, not a blind port.

## The product gap (separate from the DI bug)

Verified by code read *and* by the founder's own data. `mapper/message.go:38` has the only
`Info.IsFromMe` in the Go tree, and it is a **branch, not a filter**: owner-authored messages become
`channel.message_sent`, are projected into `gateway_messages` with `direction='SENT'`, and stop there.
`module.go:352-355` registers integration bridges for received/delivered/seen and **none** for sent;
`listen_events.go:84` annotates it "projection-only, no SSE". `ConsumeInboundMessage` subscribes only
to `integration.channel_message.received` and never reads the `fromMe` flag — which the mapper
hardcodes to `false` anyway, so that contract field is dead.

Consequence: a message you type yourself is **stored and displayed, never heard**. The founder wants
that to change (#16 is the shape it should take). The hazard to design around: `channel.message_sent`
is emitted from **two** sites — the live whatsmeow event when you type on your phone, and
`emitMessageSent` (`whatsmeow_channel.go:273`) when codedm itself sends, because whatsmeow does not
reliably echo. Same event name. If `sent` starts driving classification without distinguishing
provenance, every reply the agent sends re-enters as input and it answers itself. The two emission
sites *are* distinguishable at the point they emit; the fix belongs there.

## Landmines — do not rediscover these

- **There are two SQLite stores.** The desktop app uses
  `~/Library/Application Support/app.codedm.desktop/data/codedm.db` (Tauri `app_data_dir()` +
  identifier), ~64 MB with the founder's real WhatsApp history. `bun dev` / `bun migrate:dev` / the
  smokes use `~/.codedm/data/codedm.db`. Cleaning one does nothing to the other.
- **`target/debug/migrations` accumulates.** Tauri's copy of `bundle.resources` is additive. Ten
  pre-Fase-0 **Postgres** migrations survived there and, sorting first, made the daemon die on
  `SQLITE_ERROR: near "SCHEMA"` before opening its port — reported only as a `sidecar:error` event,
  so the app just came up with no daemon and nothing printed. Fixed by `211bf01c`; if you see the
  daemon missing, check that directory first.
- **`bun desktop:dev` alone is not enough** when TS sources changed — it does not rebuild the
  sidecars. Run `bun desktop:sidecars` first.
- **`scripts/phase3-smoke.ts` is a FROZEN artifact** and does not run against HEAD. Its banner says
  so. Do not "fix" it — a smoke record edited after the fact stops being a record. The real-claude
  smoke that *does* run is `phase6-mcp-smoke.ts`.
- **`packages/api/typescript/scripts/` is type-checked by nobody.** The tsconfig `include` has
  `"../scripts/**/*.ts"`, which points at `packages/api/scripts` — a directory that does not exist.
  Seven latent errors hide there. Fixing the glob requires excluding the frozen artifact above.
- **`git commit -- <pathspec>` fails under the lint-staged hook** (`could not write index`, and the
  commit silently does not happen). Stage explicitly, verify with `git diff --cached --name-only`,
  then commit with no pathspec.
- **`CODEDM_E2E=true` swaps the real agent for a stub.** It is the flag that mounts
  `POST /v1/_test/gateway`, so that endpoint can never demonstrate the real CLI. To exercise the real
  path, write the outbox row directly without the flag.

## How to verify, and what counts

`tsc` green is not evidence. The bug above passed every gate. What counts:

```bash
bun desktop:sidecars && bun desktop:dev     # daemon 3030, gateway 3032, vite 5173 all 200
bun e2e                                     # 6 passed / 2 skipped
cd packages/api/typescript && bun scripts/smoke-shared-store.ts    # RESULT=ok
cd packages/api/typescript && bun scripts/phase6-mcp-smoke.ts      # real claude + real MCP tool
```

For #14 specifically, the acceptance test is **runtime, in the desktop store**: inject an
`integration.channel_message.received` row into the outbox of
`~/Library/Application Support/app.codedm.desktop/data/codedm.db`, then confirm `processed_at` goes
non-null and `thread_transcript_entries` grows. A pending row from this session's attempt is already
sitting there unclaimed and makes a ready-made probe:

```sql
select name, attempts, claimed_by, processed_at
from shared_outbox where name = 'integration.channel_message.received';
```

Build the injection with the frozen event class (`new ChannelMessageReceivedEvent({...}).toJSON()`),
not hand-written JSON — the outbox payload is a serialized `BaseEvent` envelope and guessing its shape
invents a second contract. Mirror `TestIngressController`'s `inbound-message` branch, minus HTTP and
minus `CODEDM_E2E`. The script must live inside `packages/api/typescript/` or workspace imports will
not resolve.

## Working agreements from this session

- All work local. No push, no fetch. `main` stays untouched.
- Park with findings rather than invent or stub.
- **Prove the gate can fail.** Every check in this session that was not adversarially tested turned
  out vacuous at least once — a `grep -q CONNECTED` that passes on `DISCONNECTED`, a `| tee` that
  eats an exit code, a comparison of two empty strings printing both "DRIFT" and "VACUOUS", a query
  naming a column that does not exist. Perturb the input and watch the check fail before trusting it.
- Ask in plain prose; the founder does not want the question widget.
