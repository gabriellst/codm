# Preview de artefatos na conversa — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Each Task wraps one
> observable behavior in an outer RED→GREEN cycle.

**Goal:** O que o agente produz aparece na conversa, no momento em que foi produzido, já renderizado: a imagem se vê, o áudio e o vídeo tocam, o link se clica, o arquivo se abre.

**Architecture:** O contrato ganha os dois kinds que faltam (`AUDIO`, `VIDEO`) — a forma do artefato passa a estar no discriminante, e é isso que autoriza o frontend a despachar player por kind em vez de adivinhar por extensão. O `artifact` BC ganha **uma** porta nova, de leitura de bytes (`GetArtifactContent`), cujo path no disco sai da linha do banco e nunca do request. `ListArtifacts` passa `ref` adiante, e é só. A linha do tempo da conversa é composta na VIEW, fundindo `useGetSessionChat` com `useListArtifacts` — `GetSessionChat` não muda, e não muda porque o contrário exigiria um 2-ciclo `thread ↔ artifact` no `CONTEXT_MAP` (ver Decisão 6 da spec). O frontend concentra a renderização num `ArtifactPreview` com mapa exaustivo por kind, usado tanto pela bolha da conversa quanto pelo card da aba.

**Tech Stack:** TypeScript, Bun, Fastify, Drizzle/SQLite, tsyringe, Zod, Kubb, React 19 + TanStack

**Spec:** `.specs/2026-08-06-preview-de-artefatos-na-conversa-design.md`
**Tasks:** 5
**Estimated minutes:** 150

---

## Task T1 — Contract Lock: `ArtifactKind` passa a nomear a forma

**Files to write:**
- Modify: `packages/contracts/wire/enums/artifact-kind.tsp` — membros `AUDIO`, `VIDEO`; `@doc` reescrito (IMAGE/AUDIO/VIDEO/FILE referenciam path local, LINK referencia URL)
- Regen: `packages/contracts/generated/{typescript,go,rust}` via `bun contracts`
- Add: `packages/contracts/db/schema/migrations/00XX_*.sql` via `bun migrate:create` — recriação de `artifact_artifacts` com o CHECK novo (precedente: `0011_jittery_the_anarchist.sql`, que fez o mesmo para `thread_loops.kind`)
- Modify: cópia `//go:embed` via `bun run --cwd packages/contracts db:sync-go`

**Files to read:** `packages/contracts/db/schema/artifact.ts`, `packages/contracts/db/schema/_enum.ts`, `packages/contracts/db/schema/migrations/0011_jittery_the_anarchist.sql`

**Scope fence:** DONE elsewhere — nada. OUT — qualquer consumidor do enum (`RecordArtifact` já aceita `z.enum(ArtifactKind)` e por isso **não muda**; o entity schema idem). Não renomeie nem remova `IMAGE`/`FILE`/`LINK`.
**Gate:** `bun contracts && bun run --cwd packages/contracts db:check-go` verde; `bun migrate:dev` aplica.
**AC:** AC-1, AC-2

### Steps
- [x] T1.1 — Editar o `.tsp`, rodar `bun contracts`, conferir os três alvos gerados.
- [x] T1.2 — `bun migrate:create` e ler o SQL emitido antes de aceitar (tem que ser recriação de tabela + cópia, não DROP sem copy).
- [x] T1.3 — `db:sync-go` + `db:check-go`.
- [x] T1.4 — Teste em `packages/api/typescript/src/artifact/usecases/RecordArtifact.test.ts`: gravar `AUDIO` e `VIDEO` e ler de volta pelo repositório (AC-2).

---

## Task T2 — `MimeTypes` deixa de mentir, e o resolvedor que já existe sai do armário

**Files to write:**
- Modify: `packages/api/typescript/core/src/types/Http.ts` — `.jpeg`/`.jpg` → `image/jpeg`; `.mid`/`.midi` → `audio/midi`; membros novos `.mp4` (`video/mp4`), `.m4a` (`audio/mp4`), `.mov` (`video/quicktime`), `.flac` (`audio/flac`)
- Modify: `packages/api/typescript/core/src/utils/MimeTypeExtractor.ts` — **já existe**, sem uso e sem export; ganha o tipo de retorno `MimeTypes` (era `string`) e o docblock que registra "extensão é evidência, não prova". Não crie um `MimeType.ts` novo: reusar o artefato que está aqui é o ponto.
- Add: `packages/api/typescript/core/src/utils/MimeTypeExtractor.test.ts`
- Modify: `packages/api/typescript/core/src/index.ts` — exportar `./utils/MimeTypeExtractor`

**Files to read:** `packages/api/typescript/core/src/types/Http.ts` (o enum inteiro), `core/src/utils/MimeTypeExtractor.ts`, `core/src/index.ts`

**Scope fence:** OUT — sniffing de magic bytes; qualquer outro valor do enum (`.xml = 'XML'` fica como está: é feio e não é desta frente).
**Gate:** `cd packages/api/typescript && bun test core/src/utils/MimeType.test.ts`
**AC:** AC-10

### Steps
- [x] T2.1 — Teste RED: `.jpg`, `.jpeg`, `.PNG` (maiúsculas), `.mp4`, `.m4a`, `.webm`, `.mid`, desconhecida → `application/octet-stream`, e a asserção estrutural "nenhum valor do enum começa com `.`" (é ela que impede o alias quebrado de voltar).
- [x] T2.2 — GREEN.

---

## Task T3 — `GetArtifactContent`: os bytes do artefato, pelo id, com Range

**Files to write:**
- Add: `packages/api/typescript/src/artifact/usecases/GetArtifactContent.ts` — resolve a linha (dono + thread), recusa `LINK`, recusa arquivo ausente, devolve `{ absolutePath, contentType, size, fileName }`
- Add: `packages/api/typescript/src/artifact/usecases/GetArtifactContent.test.ts`
- Add: `packages/api/typescript/src/artifact/controllers/GetArtifactContent.ts` — `GET /threads/:threadId/artifacts/:artifactId/content`; `rawResponse` com `Readable.toWeb(createReadStream(...))`; `Accept-Ranges`, `Content-Type`, `Content-Length`, `Content-Disposition: inline`; `206` + `Content-Range` quando há `Range`; **sem** `static mcpScopes`
- Add: `packages/api/typescript/src/artifact/controllers/GetArtifactContent.test.ts`
- Modify: `packages/api/typescript/src/artifact/controllers/index.ts`, `src/artifact/usecases/index.ts`, `src/artifact/errors/index.ts` (código `ARTIFACT_NOT_FOUND` / `ARTIFACT_CONTENT_UNAVAILABLE` se ainda não existirem)

**Files to read:** `src/agent/controllers/StreamTerminalSession.ts` (o precedente de `rawResponse`), `core/src/types/Controller.ts` (§`rawResponse`), `core/src/services/HttpRouter/FastifyHttpRouter.ts` (`sendWebResponse` — como o body web vira stream node), `src/artifact/repositories/ArtifactRepository/ArtifactRepository.ts`

**Scope fence:** DONE elsewhere — `mimeTypeForPath` (T2). OUT — expor a porta em MCP; qualquer leitura de path vindo do request; limite de tamanho; cache headers.
**Gate:** `cd packages/api/typescript && bun test src/artifact && bun x tsc -p tsconfig.build.json --noEmit`
**AC:** AC-5, AC-6, AC-7, AC-8, AC-9

### Steps
- [x] T3.1 — Testes RED do use case: ok; 404 para id inexistente / outro dono / thread trocada / arquivo sumido; recusa de `LINK`.
- [x] T3.2 — GREEN do use case.
- [x] T3.3 — Testes RED do controller: corpo completo com content-type e `inline`; `Range: bytes=2-5` → `206` + `Content-Range` + os bytes exatos; ausência em `mcpExposure()`.
- [x] T3.4 — GREEN do controller.

---

## Task T4 — O read model passa a carregar o que se vê

**Files to write:**
- Modify: `packages/api/typescript/src/artifact/usecases/ListArtifacts.ts` — `ref` no output schema e no map
- Modify: `packages/api/typescript/src/artifact/usecases/RecordArtifact.test.ts` — a asserção de `ref`
- Regen: `bun sdk`

**Files to read:** `src/artifact/usecases/ListArtifacts.ts`, `packages/contracts/db/schema/artifact.ts`

**Scope fence:** OUT — **qualquer** mudança em `GetSessionChat` (Decisão 6: a fusão é na view; um campo de artefato ali obrigaria a aresta `thread → artifact` contra a `artifact → thread` já declarada, isto é, um 2-ciclo anotado); qualquer projection nova; qualquer aresta nova no `CONTEXT_MAP`.
**Gate:** `cd packages/api/typescript && bun test src/artifact && bun sdk && bun tsc`
**AC:** AC-3, AC-4

### Steps
- [x] T4.1 — RED: `ListArtifacts` devolve `ref`.
- [x] T4.2 — GREEN.
- [x] T4.3 — `bun sdk` e conferir que `ref` e a rota de conteúdo existem no SDK gerado.

---

## Task T5 — O preview, na conversa e no catálogo

**Files to write:**
- Add: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactPreview/index.tsx` — mapa exaustivo `Record<ArtifactKind, ComponentType<ArtifactPreviewProps>>`; fallback de carga falha para a linha de arquivo; `artifactContentUrl(threadId, artifactId)` derivado da query key da SDK
- Add: `packages/app/react/src/routes/(app)/threads/$threadId/-components/ArtifactPreview/index.test.tsx`
- Add: `.../-components/ArtifactLightboxDialog/index.tsx` — imagem em tamanho cheio, aberto por `useDialogStore().show(...)`
- Modify: `.../-components/ArtifactsSection/index.tsx` — usa `ArtifactPreview`; o `repeating-linear-gradient` some
- Modify: `.../-components/SessionChatSection/index.tsx` — chama `useGetSessionChat` **e** `useListArtifacts`; funde numa união discriminada ordenada por `at`; `getItemKey` distinto por tipo; `renderItem` despacha
- Add: `.../-components/TranscriptArtifact/index.tsx` — a moldura de bolha do artefato na conversa
- Modify: `packages/app/react/src/locales/{pt,en}.json` — `enums.ArtifactKind.{AUDIO,VIDEO}` + as chaves novas de `session.*`

`useThreadRealtime` **não muda** (Decisão 12): a chave que ele já invalida em `integration.artifact.recorded` é a mesma que agora alimenta a conversa.

**Files to read:** `packages/app/react/CLAUDE.md`, `.../ArtifactsSection/index.tsx`, `.../SessionChatSection/index.tsx`, `.../TranscriptBubble/index.tsx`, `src/components/ui/virtual-list.tsx`, `src/hooks/useTerminalStream.ts` (o precedente de montar URL a partir da query key da SDK)

**Scope fence:** OUT — miniatura server-side; download automático; player customizado (os controles são os nativos do elemento); preview de mídia recebida do contato.
**Gate:** `cd packages/app/react && bun test && bun x tsc --noEmit`; depois `bun lint` e `bun run test` na raiz.
**AC:** AC-11, AC-12, AC-13, AC-14, AC-15, AC-16

### Steps
- [x] T5.1 — `ArtifactPreview` + teste (um caso por kind + o fallback de erro).
- [x] T5.2 — `ArtifactsSection` passa a usá-lo.
- [x] T5.3 — Linha do tempo em `SessionChatSection` + `TranscriptArtifact`.
- [x] T5.4 — i18n nos dois locales.

---

## Close-out

- [x] `bun tsc` verde
- [x] `bun lint` verde
- [x] `bun run test` verde
- [x] `bun run --cwd packages/contracts db:check-go` verde
- [x] `git status` limpo fora dos arquivos do PR
