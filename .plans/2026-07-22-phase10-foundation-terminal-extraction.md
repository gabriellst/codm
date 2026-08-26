# Phase 10 — Foundation terminal-runner extraction (grounded plan)

Status: **RATIFICADO (founder, 2026-07-23)** — decisões, verbatim:
- **FORK A = A1** (alargar o seam para o shape completo do engine whatscode).
- **FORK B = sessão por issue** (`issueId` como identidade; `chatId` vira mapeamento issue/thread).
- **FORK C = ADOTAR o `AgentStreamRegistry`** do whatscode inteiro (opção 1 — NÃO o fold preferido
  pelo plano): re-chaveado por `issueId` (Fork B), absorvendo as responsabilidades do
  `TerminalSessionRegistry` atual — o guard single-active-per-issue É invariante e migra para
  dentro do registry adotado; `TerminalSessionRegistry` é superseded.
- **FORK D = D2 DEFINITIVO — spike PASSOU nos 2 critérios** (2026-07-23, wf_17ad780a-92e):
  Bun.Terminal dirigiu o claude REAL (trust-prompt respondido, TUI alcançada, resize, kill limpo,
  zero zumbis) e PGlite funcionou dentro de `bun build --compile` (embedding dos 3 assets
  obrigatório — receita exata). API surface, gotchas e receita:
  `.specs/codedm/2026-07-23-fork-d2-spike.md` (+ scripts em `.specs/codedm/spike-d2/`).
  Fallback D1 (run-under-Node + nvm shim) DESCARTADO — sem shim nvm em dev/build/e2e.
- **Emendas = como recomendado**: `StopKind += AUTH_REQUIRED` (+ admissibilidade em
  `StopResolution`); `idle_evicted` domínio-only (sem wire); `action_detected` só frame SSE.

De-risking done, one fork-independent slice landed (`3bc545b5`). This is the `.plans/` artifact mandated
for a structural multi-context port (CLAUDE.md: "grill the design and write a `.plans/`
plan before touching code"; audit-distillation: skipping it caused repeated full-context
rewrites). The founder GO (BUILD-LOG L74) authorized the *extraction*; it did not resolve
*how* the battle-tested engine reconciles with the seam codedm deliberately narrowed in
phases 5/6b/9. Those reconciliations are the forks.

## Source of truth
- Source: `whatscode-ref` @ `FETCH_HEAD` = `866c51c0` (branch `whatscode/foundation`), READ-ONLY,
  read via `git show FETCH_HEAD:<path>`. Agent family = `packages/api/src/agent/` — **78 files,
  ~6,715 lines** (runner `ClaudeCliTerminalLLMRunner.ts` alone = 1,051).
- Target: `codedm` `packages/api/typescript/src/terminal/` (phase-5 seam). Kernel
  `@codedm/core-typescript` (same lineage: `BaseDomainEvent`, `BaseError`, `EventHandler`,
  `BoundedContext`, `InstanceRegistry`/`expandBindings`, `ExternalMediator`, `DomainEventRepository`).
- Contract: frozen `packages/contracts/wire/*.tsp` → codegen `generated/{typescript,go}`.

## Verified facts (de-risking — done this pass)
- **node-pty@1.0.0 compiles + spawns a real PTY under Node v22.23.1 in ~6s** (Xcode clang + Python
  3.9.6 present). Native path is viable on this machine. `PTY_DATA="hello-from-pty"`, exit 0.
- **Node is nvm-only** (`v22.23.1`, `v24.16.0`, `v24.18.0`) — NOT on the default non-interactive
  PATH; `node`/`npm`/`node-gyp` unresolved in a bare shell. Run scripts + e2e harness boot + the
  node-pty install MUST resolve node via `~/.nvm` (e.g. source `nvm.sh`, or pin an absolute
  `$HOME/.nvm/versions/node/v22.23.1/bin`). A naive `node ./dist/server.js` fails here.
- **claude binary present** at `/Applications/cmux.app/Contents/Resources/bin/claude` → the REAL
  smoke gate (Step-5) is possible *once the runner is extracted and runnable under Node*.
- **Baseline green at HEAD**: `tsc -p tsconfig.build.json` exit 0; ProviderDetector suite 6/6.
- **Live Bun-only runtime sites** were exactly two: `CliAgentRunner` (being replaced) and
  `SystemProviderDetector` (`Bun.which`/`Bun.spawn`) — the latter **de-Bunned + committed**
  (`3bc545b5`), fork-independent. No other `Bun.*` runtime calls remain (only docstring prose).

## FORKS — founder decisions required before the port body (each wrong guess = full rewrite)

**FORK A — seam shape (the crux).** codedm's `AgentRunner` was *deliberately* narrowed to
`generate()` + `stream()` yielding `TerminalRuntimeEvent` (`output|exit`) — "pipes-first é o design
DEFINITIVO, não fallback" (BUILD-LOG L71). Whatscode's `TerminalLLMRunner` is a rich session engine:
`stream/getSession/killSession/prewarm` + SessionMap/SessionStore + write-queue + transcript-JSONL
tail + `ClaudeBootSequence` (trust-prompt) + a **9-variant `AgentGenerationEvent`** union. "Replace
CliAgentRunner as the real AgentRunner binding" is **not drop-in**:
  - A1 — **Widen the seam** back to the whatscode runner shape. Faithful to "battle-tested
    extraction," but cascades into `RunTerminalSession`, `TerminalOutputAccumulator`, the SSE
    controller, the 6b saga, and the frozen event contract (AG-UI frames, reply-chunk vs
    reply_drafted, process-finished vs TerminalSessionCompleted). Large blast radius; reverses the
    phase-5/6b/9 narrowing.
  - A2 — **Keep the narrow seam**, adopt only the runner INTERNALS behind `stream()`: node-pty
    `spawner.ts` + `transcript.ts` tail + `ansi.ts` + `tui/TuiActionParser`; discard
    SessionMap/queue/prewarm/getSession/killSession. Cheap, but throws away most of what makes the
    engine "battle-tested" (resume, idle-evict, concurrent-queue) — the very reason the founder GO'd
    the extraction.
  These are mutually exclusive and shape all 78 files. **Recommendation: A1** (the GO's intent is
  the full engine), but the founder must ratify because it re-widens a surface three phases closed.

**FORK B — session identity.** Whatscode keys sessions by `(channelId, remoteId)` (WhatsApp bridge
pair) with `chatId`/`ownerId`; codedm keys by `issueId` (one session per issue, single-active guard
in `TerminalSessionRegistry`). Task says map `chatId → issueId/threadId`. Re-keying is invasive:
SessionMap, SessionStore, transcript resume (pre-generated `--session-id`), and the Drizzle repo all
assume the pair. Founder confirms the identity model (one session per issue vs per remote).

**FORK C — AgentStreamRegistry premise is false.** The task says reconcile "theirs vs ours (ported
earlier from dev)". **codedm has no AgentStreamRegistry.** The single-active guard + observer live in
`TerminalSessionRegistry`. Decision: adopt whatscode's `AgentStreamRegistry` wholesale, OR fold its
richer bits into the existing `TerminalSessionRegistry` (preferred — avoids two overlapping
registries; preserves the codedm issueId-rekey + single-active guard the task wants kept).

**FORK D — runtime (resolved, needs sign-off).** Build with Bun, run daemon under Node + node-pty
(verified). Operational: install node-pty with the nvm node; dev/build scripts = `build → dist` then
`node --enable-source-maps ./dist/server.js` with node resolved via nvm; `bun:test` stays under Bun;
node-pty-touching suites skip-gate when no TTY (mirror foundation). e2e harness (`packages/e2e`
run-e2e + playwright webServer) must boot the daemon the Node way. No design ambiguity — just founder
sign-off on the nvm-resolution shim.

## AMENDMENT map (Step 2 — grounded against frozen wire set; needs ratification + Go regen)
Frozen `StopKind` = { SERVER_ERROR, BLOCKED_BY_CLASSIFICATION, HUMAN_REQUESTED, APPROVAL_NEEDED }.
- **AMENDMENT: `StopKind += AUTH_REQUIRED`** — wires whatscode `TerminalSessionAuthRequiredEvent`
  into the frozen stop control plane (founder: "auth_required → STOP kind or dedicated event").
  Cleanest as a StopKind value: claude needs re-login → RaiseStop(AUTH_REQUIRED) → thread
  NEEDS_ATTENTION. Add matching `StopResolution` admissibility.
- **AMENDMENT: add `idle_evicted`** — whatscode `TerminalSessionIdleEvictedEvent`. Terminal-domain
  event by default; wire only if BC4/UI must react to eviction (founder decides scope).
- **AMENDMENT (conditional): `action_detected`** — only if cross-boundary. Default = SSE frame
  (structured terminal line), NOT a wire event. Founder decides.
- **No amendment needed** (already covered): `AgentReplyChunk`/`AgentMessageSent` → frozen
  `agent.reply_drafted` + SSE two-stream; `AgUiFrame` → SSE browser frames; `AgentProcessFinished`
  → existing domain `TerminalSessionCompletedEvent`; `TerminalSessionSpawned/Resumed/Killed` →
  terminal-domain lifecycle. `InboundRunSucceeded/Failed`/`InboundDroppedNoMapping` → Step-4 saga.
Every amendment goes in the commit message as an `AMENDMENT:` line; regen `bun contracts`/codegen
ts+go; `check:generated` must stay green.

## Extraction waves (dependency-ordered; execute AFTER forks resolved)
0. Contract amendments + codegen regen (ts+go). Gate: check:generated.
1. Leaves: `enums/` (TuiActionType, TuiMarker, TurnEndSignal), `ansi.ts`, `logger/format.ts`.
2. Value/transport: `events/*` (map per AMENDMENT map), `entities/TerminalLLMSession` + repos.
3. Runner internals: `spawner.ts` (node-pty + resolveClaudeBin/BinaryProbe), `transcript.ts`,
   `queue.ts`, `SessionMap`/`SessionStore`, `ClaudeBootSequence`, `tui/*`, `RunnerLogger`.
4. Runner + ports: `ClaudeCliTerminalLLMRunner` + `TerminalLLMRunner` port + `MockTerminalLLMRunner`
   (bind per Fork A). Reconcile registry (Fork C).
5. Inbound path (Step 4): fold `ChannelMessageReceivedHandler` + `MappingPrewarmService` +
   `InboundDroppedNoMapping` into the existing 6b saga `RunTerminalSessionOnClassification` — ONE
   inbound path, no duplicate. Keep E2eStub + Stub runners (tests + e2e depend on them).
6. Port the test suites (concurrent, crash, eviction, prewarm, trust-prompt, RunnerLogger,
   TuiActionParser, actionRegistry) adapting DI to codedm registry; skip-gate node-pty/TTY tests.

Import adaptation: `@shared/types/Registry` → `@codedm/core-typescript`; whatscode
`@agent/*` path alias → relative `../`; better-auth/ownerId ctx → codedm `OperatorMiddleware`/ctx;
`z.domainEvent`/base classes → codedm `BaseDomainEvent`/`BaseError`; enums → `@codedm/contracts-
typescript/wire/enums`.

## Gate / skip matrix (Step 5 — exit codes separate)
root `tsc` · `bun run test` (ported suites incl.; node-pty/TTY suites skip-gate when no TTY, mirror
foundation) · `build` · `test:tooling` · `check:generated` (after regen) · e2e green with stub
runner · REAL smoke: spawn extracted runner vs `/Applications/cmux.app/.../claude` in a scratch dir,
assert transcript tail + frames + clean teardown; skip honestly if binary absent.

## This pass delivered
- De-risk: node-pty compile+PTY-spawn verified under Node v22; node-via-nvm + claude-binary located;
  baseline green confirmed; Bun-runtime surface mapped.
- Code: `3bc545b5` de-Bun SystemProviderDetector (fork-independent Step-3 slice; tsc + 6/6 green).
- This plan + the 4 forks + the grounded amendment map.
