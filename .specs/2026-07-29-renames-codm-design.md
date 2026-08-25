# Frente A — renames + rebrand CODM (4 itens mecânicos)

**Date:** 2026-07-29
**Status:** Approved
**Bounded Context:** cross (client, contracts, api, tauri, docs)
**Kind:** chore
**Story Points:** 8 — multi-workspace (client/contracts/api/tauri/docs) + um codemod cross-arquivo, sem contrato novo nem lógica de domínio

## Context

Quatro pendências mecânicas (rename/delete/rebrand) foram acumuladas no repo e precisam de uma passada dedicada, isolada das frentes grandes em andamento para não gerar conflito de merge:

1. `packages/client/generators/error-codes.ts` gera a pasta `packages/client/dist/typescript/src/error-codes` (outDir na linha ~20), consumida hoje via specifier `@codedm/client-typescript/error-codes` em dois pontos do `app-react`: `packages/app/react/src/lib/errors.ts` e `packages/app/react/src/locales/error-codes.check.ts`.
2. `packages/client/dist/http` é uma pasta órfã — zero consumidores, sem alteração desde o commit de nascimento (`2dbc4994`). O `http` ativo já vive em `packages/client/dist/typescript/src/http`, exportado via subpath `./http`.
3. `schema-sqlite` aparece hoje em ~22 pontos de toque: pasta fonte `packages/contracts/db/schema-sqlite/`, exports + script em `packages/contracts/package.json`, `packages/contracts/db/migrations.ts`, `biome.jsonc`, config do graph (`scripts/graph/core/config.ts`, `scripts/graph/adapters/ts/extractors/drizzle.ts`), `scripts/db/sync-sqlite-migrations.ts` (+ test), `packages/api/typescript/scripts/build.ts` (dist `schema-sqlite/migrations`), `docker/Dockerfile.api` (linha ~57), `packages/app/tauri/config/build-sidecars.ts`, 3 testes de arquitetura/boot com path hardcoded (`packages/api/typescript/tests/kernel/concurrent-boot.test.ts`, `packages/api/typescript/tests/architecture/context-map.test.ts`, `packages/api/typescript/tests/architecture/enum-placement.test.ts`), `packages/api/typescript/scripts/migrate.ts`, skill `/migrate`, `.claude/hooks/classify-edit.test.ts`, docs (`CLAUDE.md`).
4. `template.config.ts` (raiz) é a fonte formal da identidade do fork: `scope = '@codedm'`, `brand = 'codedm'`, com comentário explícito dizendo que rebranding "NUNCA é codemod" — é editar o config + regenerar (`bun sdk` / `bun contracts`). O `go.mod` prefix (`LANG_CONFIG.go.modulePrefix = 'template'`) é **deliberadamente desacoplado** do brand (comentário nas linhas ~32-40 explica que é um path interno de módulo Go, não superfície de marca). Fora do config, há pontos que **não** derivam dele: `CODEDM_DATA_DIR` com default hardcoded `'~/.codedm/data'` em `packages/api/typescript/core/src/utils/Config.ts:31`, o prefixo de env `CODEDM_*` (14 variáveis, ~243 referências), `packages/app/tauri/src-tauri/tauri.conf.json` gerado (`productName: "CodeDM"`, `identifier: "app.codedm.desktop"`, `externalBin: ["binaries/codedm-daemon", "binaries/codedm-gateway"]`), locales, descrições TypeSpec, nomes de binário. Busca case-insensitive por `codedm` bate ~979 ocorrências no repo.

## Problem

Essas quatro pendências ficaram acumuladas sem dono nem execução: um nome de pasta gerado que não bate mais com o domínio que representa (`error-codes` deveria ser `errors`), uma pasta órfã ocupando espaço e confundindo leitura do workspace, uma convenção de nome (`schema-sqlite`) que amarra a pasta de schema ao dialeto de banco ao invés de ficar neutra, e o brand `codedm` espalhado por ~979 pontos do repo que precisa virar `codm` sem quebrar o mecanismo de fork (`template.config.ts` como fonte de verdade).

## Goal

Executar as quatro mudanças mecânicas de forma determinística e verificável, sem alterar comportamento de negócio, deixando o repo com: pasta/specifier `errors` no lugar de `error-codes`; `packages/client/dist/http` removido; convenção `db/schema/` (neutra a dialeto) substituindo `schema-sqlite` em todos os pontos de toque; e identidade `@codm`/`CODM`/`codm-*` completa via codemod one-shot que também atualiza os consts `scope`/`brand` do `template.config.ts`.

## Decisions

1. **error-codes → errors, escopo completo.** Renomear o outDir do generator (`packages/client/generators/error-codes.ts`) de `dist/typescript/src/error-codes` para `dist/typescript/src/errors`; atualizar o specifier consumido nos dois pontos do `app-react` (`packages/app/react/src/lib/errors.ts`, `packages/app/react/src/locales/error-codes.check.ts`) de `@codedm/client-typescript/error-codes` para `@codedm/client-typescript/errors` (o rename de brand para `@codm` é tratado separadamente pela Decision 4); renomear também o arquivo `locales/error-codes.check.ts` junto. Sem colisão confirmada com um `errors` pré-existente no destino.
2. **`packages/client/dist/http` — deletar.** Pasta órfã confirmada (zero consumidores, intocada desde `2dbc4994`); o `http` ativo permanece em `packages/client/dist/typescript/src/http` via subpath export `./http`. Delete pode rodar a qualquer momento, independente da ordem das outras 3 decisões (ver Decision 5).
3. **schema-sqlite → schema, alcance total.** Renomear a pasta fonte (`packages/contracts/db/schema-sqlite/` → `packages/contracts/db/schema/`), os exports/script em `packages/contracts/package.json`, `packages/contracts/db/migrations.ts`, `biome.jsonc`, a config do graph (`scripts/graph/core/config.ts`, `scripts/graph/adapters/ts/extractors/drizzle.ts`), `scripts/db/sync-sqlite-migrations.ts` (+ seu teste), a saída de build em `packages/api/typescript/scripts/build.ts` (`dist/schema-sqlite/migrations` → `dist/schema/migrations`), `docker/Dockerfile.api` (linha ~57), `packages/app/tauri/config/build-sidecars.ts`, os 3 testes de arquitetura com path hardcoded, `packages/api/typescript/scripts/migrate.ts`, a skill `/migrate`, `.claude/hooks/classify-edit.test.ts` e `docs/CLAUDE.md`. A convenção resultante ("`db/schema/`, independente do dialeto de banco") sobe pro template — ver seção dedicada abaixo.
4. **CODM — identidade completa via codemod one-shot.** Rebrand determinístico e completo: npm scope `@codedm` → `@codm`, prefixo de env `CODEDM_*` → `CODM_*` (14 vars, ~243 refs), data dir `~/.codedm` → `~/.codm` (incluindo o default hardcoded em `Config.ts:31`), bundle id `app.codedm.desktop` → `app.codm.desktop`, binários `codedm-*` → `codm-*`, marca em texto (`CodeDM`/`codedm`) → `CODM` all-caps onde a marca aparece como nome próprio (`tauri.conf.json` `productName`, locales, descrições TypeSpec). Executado por script determinístico (codemod), decisão explícita do founder mesmo contra o comentário atual do `template.config.ts` dizendo "rebrand nunca é codemod" — o codemod, ao final, **atualiza os próprios consts `scope`/`brand` do `template.config.ts`** para `@codm`/`codm`, de modo que o mecanismo declarado ("o config é a fonte de verdade") continue verdadeiro após a rodada. `go.mod` module prefix continua `template/` — decoupling já documentado no config, decisão não mexida por esta frente (ver Open Questions para a confirmação formal). Dados locais existentes (SQLite em `~/.codedm/data`) **não são migrados**: pré-release, ambiente recomeça do zero no novo path `~/.codm/data`.
5. **Ordem de execução.** Esta frente inteira roda por último (T2), depois das frentes grandes em andamento, para não conflitar com merges concorrentes — exceto o delete do item 2 (`dist/http` órfão), que pode rodar a qualquer momento por não ter overlap com nenhuma frente ativa.

## User Stories

**US-1 — Consumidor de error codes no app-react**
Given o `app-react` importa erros tipados de `@codedm/client-typescript/error-codes`,
When o generator e os imports são renomeados para `errors`,
Then `lib/errors.ts` e `locales/error-codes.check.ts` (renomeado) resolvem o novo specifier sem erro de `tsc` e sem quebrar o gate de locales.

**US-2 — Workspace `client` sem pasta órfã**
Given `packages/client/dist/http` não tem nenhum import ativo no repo,
When a pasta é deletada,
Then nenhum `tsc`/build/test do workspace `client` (ou consumidores) referencia o path removido.

**US-3 — Build e migrações usando `schema`**
Given hoje `build.ts`, `Dockerfile.api`, testes de arquitetura e a skill `/migrate` apontam para `schema-sqlite`,
When todos os ~22 pontos de toque são atualizados para `schema`,
Then o build da API, o container Docker, os testes de arquitetura e o fluxo `/migrate` continuam funcionando apontando para o novo path, sem nenhuma referência residual a `schema-sqlite`.

**US-4 — Rebrand CODM ponta a ponta**
Given o repo hoje usa a identidade `codedm`/`CodeDM`/`CODEDM_*`/`app.codedm.desktop` em ~979 pontos,
When o codemod one-shot roda,
Then `template.config.ts` reporta `scope='@codm'`/`brand='codm'`, o daemon lê `CODM_*` (incluindo `CODM_DATA_DIR` default `~/.codm/data`), o app Tauri empacota com `identifier: 'app.codm.desktop'` e binários `codm-daemon`/`codm-gateway`, e uma nova busca case-insensitive por `codedm` no repo (fora de histórico git) não retorna ocorrências de código/config ativas.

## Acceptance Criteria

- [ ] AC-1: `packages/client/generators/error-codes.ts` gera a pasta em `packages/client/dist/typescript/src/errors` (outDir atualizado); `bun sdk` roda sem erro.
- [ ] AC-2: `packages/app/react/src/lib/errors.ts` e `packages/app/react/src/locales/error-codes.check.ts` (renomeado, se aplicável, para refletir o novo nome) importam de `.../errors` (specifier com o scope vigente pós-Decision 4); `tsc` do `app-react` passa.
- [ ] AC-3: `packages/client/dist/http` não existe mais no working tree; nenhum grep por `client/dist/http` retorna hit em código-fonte ativo (fora `.git`).
- [ ] AC-4: `packages/contracts/db/schema-sqlite/` não existe mais; existe `packages/contracts/db/schema/` com o mesmo conteúdo migrado.
- [ ] AC-5: `packages/contracts/package.json`, `packages/contracts/db/migrations.ts`, `biome.jsonc`, `scripts/graph/core/config.ts`, `scripts/graph/adapters/ts/extractors/drizzle.ts`, `scripts/db/sync-sqlite-migrations.ts` (+ teste), `packages/api/typescript/scripts/build.ts`, `docker/Dockerfile.api`, `packages/app/tauri/config/build-sidecars.ts`, os 3 testes de arquitetura, `packages/api/typescript/scripts/migrate.ts`, a skill `/migrate` e `docs/CLAUDE.md` não contêm mais a string `schema-sqlite`.
- [ ] AC-6: `bun x nx run api-typescript:build` (ou equivalente) produz artefato em `dist/schema/migrations` (não `dist/schema-sqlite/migrations`).
- [ ] AC-7: `template.config.ts` tem `scope = '@codm'` e `brand = 'codm'` após o codemod rodar; `LANG_CONFIG.go.modulePrefix` permanece `'template'`.
- [ ] AC-8: `packages/api/typescript/core/src/utils/Config.ts` define `CODM_DATA_DIR` com default `'~/.codm/data'`; não existe mais `CODEDM_DATA_DIR` no código.
- [ ] AC-9: `packages/app/tauri/src-tauri/tauri.conf.json` tem `identifier: "app.codm.desktop"` e `externalBin` listando `binaries/codm-daemon`/`binaries/codm-gateway`.
- [ ] AC-10: busca case-insensitive por `codedm` em arquivos rastreados pelo git (excluindo histórico/`.git`) retorna zero ocorrências.
- [ ] AC-11: após o codemod, `bun sdk` e `bun contracts` rodam com sucesso e os artefatos gerados (`packages/client/dist/typescript`, `packages/contracts/generated/*`) refletem o novo scope `@codm/*`.

## O que sobe pro template

- **Convenção `db/schema/` independente do dialeto de banco** (Decision 3): a skill `/migrate` e `docs/BACKEND.md`/`docs/CLAUDE.md` (onde aplicável no template) passam a documentar `db/schema/` como o nome canônico da pasta de schema Drizzle, sem acoplar o nome ao dialeto (`-sqlite`, `-pg`, etc.) — vale para qualquer fork que troque de dialeto de banco no futuro.
- Nenhuma outra decisão desta frente sobe pro template como convenção nova: o rename `error-codes → errors` e a deleção do `dist/http` órfão são limpezas locais deste fork; o rebrand CODM é específico da identidade deste fork (o mecanismo de rebrand via `template.config.ts` + regen já é a convenção existente do template — esta frente apenas o executa, via codemod, para este fork).

## Risks & Migration

- **Codemod × arquivos gerados**: o codemod cobre código-fonte e config versionados, mas artefatos gerados (`packages/client/dist/*`, `packages/contracts/generated/*`, `openapi.json`) podem ficar com o scope antigo até a próxima regeneração — rodar `bun sdk` / `bun contracts` logo após o codemod é obrigatório (AC-11), não opcional.
- **Bundle id novo = app "novo" no macOS**: mudar `identifier` de `app.codedm.desktop` para `app.codm.desktop` faz o macOS (Gatekeeper/Keychain/permissões) tratar o app Tauri como uma instalação nova — sem migração de permissões/keychain do bundle antigo. Consistente com a decisão de não migrar dados locais (Decision 4).

## Open Questions

- Confirmar no review: `go.mod` module prefix mantém `template/` (decoupling já documentado no `template.config.ts`, mas vale reafirmar explicitamente que esta frente não o toca, já que o founder marcou como "assunção a confirmar").
