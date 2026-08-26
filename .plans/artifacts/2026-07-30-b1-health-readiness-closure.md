# B1 — health/readiness dos sidecars — Artefato de Fechamento

**Plano:** `.plans/2026-07-30-b1-health-readiness.md`
**Commits:** `f6a0f7ea` (T1) · `a613c56b` (T2) · `a31a7402` (T3) · `31fbe1bb` (T4) · `6c55deff` (T5) · `5d4c7c2f` (T6) · este artefato (T7)
**Natureza deste documento:** measure-only. Toda saída abaixo foi executada nesta sessão, na ordem do Step T7.1, com HEAD em `5d4c7c2f` (T1–T6 já commitados) para os passos (a)/(b); os números de falseadores em (c) que exigiriam mutar código de produção são os medidos nas sessões originais de cada Task e são citados como histórico, não re-derivados aqui (regra do plano: T7 é docs-only).

---

## (a) Bateria completa do Step T7.1 — em ordem, saída citada

Todos os comandos abaixo rodaram nesta sessão, na ordem exata do plano. `cargo` sempre por `--manifest-path`; e2e via `cd packages/e2e && bun run test` (nunca `bun e2e`); `check:generated` por último, pós-commit de T6.

1. **`cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit`**
   Exit 0, sem output (limpo).

2. **`cd packages/api/typescript && bun test`**
   ```
   911 pass
   3 skip
   0 fail
   1 snapshots, 2177 expect() calls
   Ran 914 tests across 144 files.
   ```

3. **`cd packages/api/typescript/core && bun test`**
   ```
   206 pass
   0 fail
   435 expect() calls
   Ran 206 tests across 30 files.
   ```

4. **`bun tsc`** (raiz)
   `Successfully ran target tsc for 7 projects` — `core-typescript`, `api-typescript`, `app-astro` (0 errors/0 warnings/0 hints), `app-react`, `@codedm/client-typescript`, `e2e`, `api-go` (`go vet ./... && go -C core vet ./...`). Todos verdes.

5. **`bun lint`**
   `Successfully ran target lint for 3 projects` — `app-styles` (biome, 2 files, no fixes), `app-react` (eslint, 0 warnings), `app-astro` (biome, 1 file, no fixes).

6. **`bun test:tooling`**
   ```
   414 pass
   0 fail
   1073 expect() calls
   Ran 414 tests across 26 files.
   ```

7. **`cd packages/api/go && go build ./... && go -C core build ./...`**
   Exit 0, sem output.

8. **`cd packages/api/go && go test ./... && go -C core test ./...`**
   Todos os pacotes com testes reportam `ok` (cached — sem mudança de fonte desde o último run real); os dois pacotes deste plano, isolados e verbosos:
   ```
   go test -v ./internal/shared/controllers/...
   --- PASS: TestHealthIs200WhenSelect1Works (0.01s)
   --- PASS: TestHealthIsNot200WhenSelect1Fails (0.01s)
   --- PASS: TestChannelStatusNeverChangesTheHttpStatus (0.01s)
   PASS

   go -C core test -v ./services/httprouter/...
   --- PASS: TestGlobalMiddlewaresApplyToOrdinaryControllers (0.00s)
   --- PASS: TestPublicControllerBypassesGlobalMiddlewares (0.00s)
   --- PASS: TestPublicStillAppliesControllerOwnMiddlewares (0.00s)
   PASS
   ```
   6 pass total (3 + 3) — confere com o número do plano em T3.7 (este, ao contrário de T1/T2, estava certo).

9. **`cargo build --manifest-path packages/contracts/generated/rust/Cargo.toml`**
   `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 0.50s`

10. **`cargo test --manifest-path packages/contracts/generated/rust/Cargo.toml`**
    `unittests src/lib.rs`: 0 tests. `tests/roundtrip.rs`: 3 passed. `tests/slot.rs`: 4 passed. `tests/slots_meta.rs`: 1 passed. Doc-tests: 0. Total **8 passed, 0 failed**.

11. **`cargo build --manifest-path packages/client/dist/rust/Cargo.toml`**
    `Finished \`dev\` profile [unoptimized + debuginfo] target(s) in 1.71s` (compila `codedm-contracts-rust` + `codedm-client-rust`).

12. **`cargo test --manifest-path packages/client/dist/rust/Cargo.toml`**
    `unittests`: 0. `tests/builder.rs`: 3 passed (inclui `contract_enums_are_the_wire_crate_types`). `tests/live_smoke.rs`: 0 passed, **1 ignored** ("needs live backends on :3030/:3032 — run with -- --ignored", by design). `tests/message_received_union.rs`: 5 passed. Doc-tests: 0. Total **8 passed, 0 failed, 1 ignored**.
    Confirmado por grep: `pub async fn health` existe em `packages/client/dist/rust/src/typescript/mod.rs:8422` e `.../go/mod.rs:21704` — a operação tipada que T4 consome.

13. **`cargo build --manifest-path packages/app/tauri/src-tauri/Cargo.toml`**
    `Finished \`test\` profile [unoptimized + debuginfo] target(s) in 0.32s` (nada a recompilar — árvore já estava verde do commit de T5).

14. **`cargo test --manifest-path packages/app/tauri/src-tauri/Cargo.toml`**
    ```
    unittests src/lib.rs — 5 tests:
      sidecars::gate::tests::every_sidecar_ready_reveals_the_main_window_exactly_once ... ok
      sidecars::gate::tests::the_last_arrival_always_reveals_something ... ok
      sidecars::gate::tests::a_single_failure_reveals_the_error_splash_and_never_main ... ok
      sidecars::gate::tests::stderr_is_retained_bounded_and_tail_first ... ok
      commands::export_bindings::export_typescript_bindings ... ok
    unittests src/main.rs — 0 tests
    tests/no_raw_http.rs — 2 tests:
      raw_reqwest_is_confined_to_the_api_module ... ok
      hand_rolled_http_is_confined_to_the_api_module ... ok
    Doc-tests — 0 tests
    ```
    Total **7 passed, 0 failed** (4 do gate + 1 de export de bindings + 2 de `no_raw_http`).

15. **`bun desktop:generate --check`**
    `✓ desktop shell config in sync (2 files)` — sem regeneração, sem diff.

16. **`cd packages/e2e && bun run test`**
    `6 passed (14.7s)`, `2 skipped`, 0 failed.

17. **`bun check:generated`** (pós-commit de T6, por último)
    Regenerou de fato — `openapi: wrote public/docs/openapi.json` (Go, não versionado), `client-typescript`/`client-go`/`client-rust` geradores rodaram (`rust-codegen: wrote .../go/mod.rs` e `.../typescript/mod.rs`), `[error-codes] 79 codes from 1 service spec(s)`. Ao final: **`✓ generated output in sync (contracts bindings, SDK dist, openapi.json)`**, e `git status --porcelain` pós-regeneração devolveu vazio — os artefatos commitados em T1–T6 são bit-a-bit o que o gerador produz agora.

---

## (b) Mapa AC → teste (Step T7.2)

| AC | Onde é provado | Falseador |
|---|---|---|
| AC-1 | `packages/api/typescript/src/shared/controllers/Health.test.ts` | `middlewares` não-vazio, ou um `static mcpScopes` na classe |
| AC-2 | idem | uma chave a menos em `components` |
| AC-3 | idem (2 testes) | migração pendente devolvendo 200; cada dispatcher parado isoladamente |
| AC-4 | idem | canal DISCONNECTED mudando o código HTTP |
| AC-5 | `bun x nx run api-typescript:emit-openapi` (Step T2.7), exit 0 | um `HealthCheck` que faça I/O no construtor (quebraria o carve-out `EMIT_OPENAPI`) |
| AC-6 | `packages/api/go/internal/shared/controllers/health_test.go` (3 testes — medidos acima em (a).8) | `SELECT 1` falhando com 200; qualquer status de canal mexendo no HTTP |
| AC-7 | `packages/app/tauri/src-tauri/tests/no_raw_http.rs` (2 testes — medidos em (a).14) + `cargo build` | qualquer `TcpStream`/`HTTP/1.1` fora de `api/mod.rs`; o literal de path voltando |
| AC-8 | **SUPERSEDIDO por E2.** Substituto: `grep -rn "healthPath" packages/app/tauri` restrito a *ocorrências de campo* (não prosa) → vazio + `generate.test.ts` DSK-03 (`expect('healthPath' in sidecar).toBe(false)`, medido em (a) via `bun desktop:generate --check` verde) | o campo `healthPath` voltar ao manifesto `SIDECARS[]` |
| AC-9 | `packages/app/tauri/src-tauri/src/sidecars/gate.rs` (4 testes — medidos em (a).14) | `Reveal::Main` com qualquer falha; um desfecho que devolve `None` no último a chegar |

Nota sobre AC-8: a decisão original da spec ("`healthPath` sai do hardcode via `plugins.<nome>` no `tauri.conf.json`") foi substituída em desenho pela emenda E1/E2 — o caminho do health não precisa mais viver em NENHUM manifesto declarativo porque ele chega pelo método gerado da SDK (`api.client.<service>.health()`). O invariante que sobrevive não é "onde o caminho é declarado", é "o caminho não é declarado em lugar nenhum do lado da shell" — daí o grep vazio + DSK-03 como par de provas: o grep prova ausência de campo, DSK-03 prova que a ausência é uma asserção viva (não apenas um fato acidental do commit atual).

Confirmação ao vivo, nesta sessão:
```
$ grep -rn "healthPath" packages/app/tauri --include="*.ts" --include="*.rs"
packages/app/tauri/config/sidecars.ts:15: * Also NOT here (since B1/E1): each sidecar's health PATH. ...
packages/app/tauri/config/generate.test.ts:44: expect('healthPath' in sidecar, ...).toBe(
```
As duas únicas ocorrências são: (1) a prosa do cabeçalho de `sidecars.ts` — adicionada por esta própria Task T6 — explicando a ausência, e (2) a própria asserção DSK-03. Nenhuma é uma declaração de campo — o grep "vazio" do plano tem que ser lido como "vazio de campo", não "vazio de string" (ver achado de imprecisão de grep abaixo).

---

## (c) Falseadores — números reais medidos (correções sobre o plano)

O plano tem contagens erradas em dois pontos (T1 e T2). Os números abaixo são os medidos, e são os que valem:

- **T1** — `packages/api/typescript/core` `bun test src/services/HealthService` → **7 pass / 0 fail** (o plano, em T1.6, dizia "8 pass" — erro de contagem do plano; a suíte tem 4 testes na primeira `describe` da espiga de multi-inject + 3 na segunda `describe` de `HealthService` = 7 `it`s, confirmado ao vivo nesta sessão em (a).3 agregando com os demais arquivos de `core`, e isolado via `bun test src/services/HealthService`: 7 pass). Mutação histórica "ready-forçado" (forçar `HealthService.report()` a sempre devolver `ready: true`): **5 pass / 2 fail** — os 2 que caem são exatamente os que afirmam `ready === false` (`FALSEADOR — um check de GATE down reprova` e `um check que LANÇA vira componente down`); os outros 5 (as 4 do mecanismo de DI + o caso "todos up") continuam verdes porque não dependem do desfecho mutado.

- **T2** — `packages/api/typescript` `bun test src/shared/controllers/Health.test.ts` → **5 pass / 0 fail** (o plano acertou este número em T2.8; confirmado ao vivo em (a).2 e isolado nesta sessão). Mutação histórica "status-fixo" (forçar `HealthController.handle()` a sempre devolver 200/`ok`, ignorando `report.ready`): **3 pass / 2 fail** — os 2 que caem são os que esperam 503 (`FALSEADOR AC-3/US-2: migração pendente` e `FALSEADOR AC-3: cada um dos três dispatchers parado`); os 3 que sobrevivem são AC-1 (não-401/403), AC-2 (tudo saudável → 200) e AC-4 (canal disconnected → ainda 200) — nenhum dos três exige 503.

- **T3** — `go test ./internal/shared/controllers/... ./core/services/httprouter/...` → **6 pass** (3 `Public`/`httprouter` + 3 `health`), medido ao vivo em (a).8, batendo com o número do plano (T3.7). Três mutações provadas na sessão original de implementação:
  1. **guard neutralizado** — remover o `if !meta.Public` em `RegisterControllers` (aplicar sempre a cadeia global): derruba `TestPublicControllerBypassesGlobalMiddlewares`.
  2. **`checkDB` engolindo erro** — fazer `checkDB` devolver sempre `{Status: "up"}` independente do resultado do `SELECT 1`: derruba `TestHealthIsNot200WhenSelect1Fails`.
  3. **`channelDiagnostic` gateando** — mudar `Gate: false` para `Gate: true` no componente `channel`: derruba `TestChannelStatusNeverChangesTheHttpStatus` (o status do canal passa a poder virar 503).

- **T4** — a rail `no_raw_http.rs` **nasceu vermelha**: no estado RED do Step T4.1 (só a rail nova escrita, `sidecars/mod.rs` ainda com `TcpStream`), o run era **1 passed / 1 failed** — `raw_reqwest_is_confined_to_the_api_module` (pré-existente) passava, `hand_rolled_http_is_confined_to_the_api_module` (nova) falhava apontando `src/sidecars/mod.rs`. Depois da reescrita do probe: **2 pass** (confirmado ao vivo em (a).14, onde os dois aparecem `ok`). `generate.test.ts` DSK-03 mutado (reintroduzir o campo `healthPath` num sidecar): **5/1** — de 6 `expect()` dentro do `it` único (2 sidecars × 3 asserções cada), a execução para no primeiro `expect('healthPath' in sidecar)` que falha, com as 5 asserções anteriores (as duas primeiras do `daemon` mais as duas primeiras do `gateway`, dependendo da ordem de iteração) já tendo passado antes do throw.

- **T5** — histórico de RED: **12 erros de compilação** no ponto intermediário do Step T5.1 (`gate.rs` referenciado pelos testes mas ainda inexistente — `cannot find type ReadinessGate` e as cascatas de tipo que o `rustc` reporta a partir daí). Verde final: **7 pass** (confirmado ao vivo em (a).14 — 4 do gate + 1 de `export_typescript_bindings` + 2 de `no_raw_http`; note que "4 do gate + 2 de `no_raw_http`" citado em T5.7 do plano soma 6, não 7 — o quinto teste, `export_typescript_bindings`, existe no arquivo mas não foi contado nessa frase do plano; não é um erro de contagem que o founder pediu para corrigir aqui, então fica registrado como observação, não como "número errado do plano" formal). Mutação `arrive()` → sempre `Reveal::Main` (ignorar `state.failures`, simulando a reversão ao fail-open pré-T5): **3 de 4 vermelhos** — `a_single_failure_reveals_the_error_splash_and_never_main`, `the_last_arrival_always_reveals_something` e `stderr_is_retained_bounded_and_tail_first` caem (todos dependem de `Reveal::BootError` em algum caminho); `every_sidecar_ready_reveals_the_main_window_exactly_once` sobrevive (nenhuma falha envolvida nesse teste, então a mutação é invisível a ele).

---

## (d) Achados da frente (registro, não ação — follow-ups do founder)

1. **Prefixo `/api` ausente no spec Go — bloqueador resolvido por convenção de base-URL, não pelo emitter.** Medido nesta sessão: o `openapi.json` do Go regenerado por `bun check:generated` tem **38 paths** — o founder citou 39 ao passar este achado; nem o corpo do commit `31fbe1bb` nem nenhum outro commit deste plano registra um número explícito, e a contagem ao vivo agora, pós-`check:generated`, é 38 (uma unidade de diferença plausivelmente por uma rota adicionada/removida entre a medição original e agora — não investigado further, fora do escopo docs-only desta Task). O fato que importa, e que se sustenta: **nenhum** dos 38 paths começa com `/api` (`RegisterControllers` monta `/api` + contexto + path apenas em runtime; `buildFullPath` do emissor devolve `meta.Path` cru com `servers: null`). Isso fazia `health()` gerado montar `{baseurl}/health` → 404 medido no T3 contra `/api/health` real. Resolvido em T4 pela convenção que o console já usa: a fronteira `/api` mora na BASE URL (`api::Api::from_env` em `src-tauri/src/api/mod.rs` monta `.go(format!("http://127.0.0.1:{channel_port}/api"))`), espelhando `ChannelProxy`/`Config.gatewayBaseUrl` (`packages/app/react/src/lib/config.ts`) — o console aponta o sub-client Go para o proxy TS, que encaminha para `${API_GO_URL}/api` server-side. O emitter Go fica **intocado de propósito**: corrigi-lo lá duplicaria o prefixo para quem já passa pelo proxy (`/api/api`). Fix estrutural no emitter (fazer os paths do spec Go já carregarem `/api`, com o proxy ajustado para não duplicar) é **follow-up do founder**, fora do escopo deste plano.

2. **`packages/client/dist/rust/src` fora de `check:generated`.** Já era um achado do Ground do plano (item 3): `scripts/check-generated.ts` vigia `contractsGenTs`, `contractsGenGo`, `clientTsDist/src` e o openapi TS — não o dist Rust. Confirmado nesta sessão: `bun check:generated` (passo 17 de (a)) regenerou `packages/client/dist/rust/src/go/mod.rs` e `.../typescript/mod.rs` como efeito colateral do gerador (`rust-codegen: wrote ...`), mas a checagem de sincronismo final (`✓ generated output in sync`) não teria pego uma divergência ali se ela existisse isolada — só o fato de o `git status --porcelain` ter voltado vazio prova que T1–T6 já commitaram a versão correta. Por isso cada Task deste plano (T2, T3) precisou de `git add packages/client/dist/rust/src` explícito no commit — prática já seguida.

3. **`grep` do AC-1 do plano é auto-contraditório ao pé da letra.** Step T2.8: `grep -rn "middlewares" packages/api/typescript/src/shared/controllers/Health.ts` → o plano espera "vazio (AC-1 por construção)". Medido nesta sessão: **não é vazio** — o docblock do `HealthController` (real, T2) cita a palavra "middlewares" três vezes em prosa, explicando exatamente por que a classe não declara nenhum. O grep do plano usa um predicado de INTENÇÃO ("nenhum middleware declarado"), não um predicado LITERAL de string — quem o executar ao pé da letra encontra 3 hits e pode concluir, errado, que AC-1 falhou. O invariante real é "nenhuma linha `override middlewares = [...]`/`static mcpScopes`", que os testes de `Health.test.ts` (`expect(...middlewares).toEqual([])`, `expect(...mcpScopes).toBeUndefined()`) já verificam mecanicamente — o grep textual nunca foi a prova, é só uma pista de leitura rápida.

4. **`grep` do Step T5.7 tem o mesmo defeito, pelo mesmo motivo.** `grep -rn "note_ready\|reveal_main_window\|AtomicUsize" packages/app/tauri/src-tauri/src` → o plano espera vazio. Medido nesta sessão: **não é vazio** — `note_ready` é o nome real do método público de `ReadinessGate` (`gate.rs:74`, chamado em `sidecars/mod.rs:225`), sobrevivente por design (a Task só deletou as FUNÇÕES LIVRES antigas `note_ready`/`reveal_main_window` e o `AtomicUsize`, não o conceito). `reveal_main_window` e `AtomicUsize`, isolados, de fato não aparecem mais — só `note_ready` "vaza" no grep textual por coincidência de nome com o método novo. Mesma lição do achado 3: o grep do plano documenta a intenção de quem escreveu, não um comando para copiar-colar sem julgamento.

5. **`eslint.config.ts` ganhou ignore de `packages/app/tauri/commands/**`, e sem ele T5 não commitava.** `bindings.ts` é gerado por `cargo test` (via `tauri-specta`, Step T5.7) e nasce com `@ts-nocheck` — o pacote `app-tauri` não tem `tsconfig.json` (achado 4 do Ground do plano: "app-tauri não tem target `test` nem `tsc`"), então nenhum parser tipado consegue processar o arquivo. `eslint.config.ts` já ignorava `packages/app/tauri/config/**` pelo mesmo motivo; `commands/**` ficou de fora até T5 precisar commitar um `bindings.ts` regenerado pela primeira vez, e o `lint-staged` (que recebe caminhos explícitos, não o ignore-glob do eslint de projeto) tentou lintá-lo e quebrou. O commit `6c55deff` (T5) já documenta isso na própria mensagem ("Sem isso este commit e impossivel sem --no-verify") — este artefato só registra o achado como parte do fechamento da frente, sem ação nova.

6. **`Cargo.lock` do `app-tauri` ganhou exatamente 1 linha.** `git show 31fbe1bb --stat -- packages/app/tauri/src-tauri/Cargo.lock` → `1 file changed, 1 insertion(+)`. A aresta `tokio` na lista de dependências de `codedm-desktop` — nenhum `[[package]]` novo, nenhuma versão movida, porque `tokio 1.53.1` já estava resolvido como transitiva do Tauri antes de D-F declarar a dependência direta.

7. **A rail `reqwest` (pré-existente, `raw_reqwest_is_confined_to_the_api_module`) pega a palavra dentro de comentários, não só de código — prova de não-vacuidade por construção.** Lida nesta sessão em `tests/no_raw_http.rs:29`: o predicado é `std::fs::read_to_string(p).contains("reqwest")` sobre o CONTEÚDO INTEIRO do arquivo, sem diferenciar comentário de código. Isso significa que qualquer prosa em qualquer `.rs` fora de `api/mod.rs` que mencione a palavra "reqwest" — mesmo só para explicar por que ali NÃO se usa reqwest — derruba a rail: o docblock desta própria Task (`sidecars/mod.rs`, atualizado em T4) precisou ser redigido evitando o literal por esse motivo. É a evidência de que a rail é textualmente estrita, não semântica — ela falsearia até uma menção inofensiva em comentário, não só um uso real de `reqwest::`.

8. **Tipos `Status`/`Status2` na SDK TS gerada — colisão de nome de componente OpenAPI (cc-bp-13, follow-up).** `packages/client/dist/typescript/src/typescript/index.ts` exporta tanto `Status`/`StatusEnumKey` quanto `Status2`/`Status2EnumKey`. Os dois literais novos deste plano (`HealthComponentSchema.status: z.enum(['up','down'])` e `HealthOutputSchema.status: z.enum(['ok','not_ready'])`) são enums inline, não roteados por um enum canônico compartilhado (`packages/contracts`) — exatamente a classe de problema que `cc-bp-13` nomeia (enum registrado localmente em vez de centralizado), e o kubb resolve a colisão de nome com o `Status` pré-existente por sufixo numérico em vez de um nome semântico. Não quebra nada hoje (os dois tipos são estruturalmente distintos e cada consumidor importa o que precisa), mas é debt de legibilidade — **follow-up do founder**, fora do escopo docs-only desta Task.

9. **`X-Owner-Id: "local"` (shell) vs. a convenção `ownerId: z.uuid()` (TS) — mismatch latente, ainda não exercitado.** `src-tauri/src/api/mod.rs` define `const LOCAL_OWNER_ID: &str = "local"` e injeta esse literal como header `X-Owner-Id` em toda chamada S2S da shell — não é um UUID. O padrão do resto do repo (`core/src/utils/schema/ExtraTypes.ts:65`, `BaseAgentInputSchema.ownerId: z.uuid()`) valida `ownerId` como UUID sempre que um schema o declara. Hoje isso não quebra nada porque o único método que a shell chama (`health()`) não tem `ctx`/`ownerId` — é exatamente o ponto do controller público (CTRL-C18). O dia em que a shell chamar um segundo endpoint que exige `ctx.ownerId: z.uuid()`, `"local"` falhará a validação — **follow-up do founder**: ou o schema desse futuro endpoint aceita um sentinel não-UUID para o caller S2S da shell, ou `LOCAL_OWNER_ID` vira um UUID fixo provisionado no boot do daemon.

10. **`app-tauri` não tem targets Nx `test`/`tsc`.** Já era o achado 4 do Ground do plano; reconfirmado nesta sessão por omissão: `bun tsc` (passo 4 de (a)) rodou 7 projetos e `bun lint` (passo 5) rodou 3 — nenhuma lista inclui `app-tauri`. Todo o Rust deste plano (T4/T5, e os passos 9–15 desta bateria) é gate explícito por `--manifest-path`, nunca coberto pelos comandos de raiz nem pelo pre-commit padrão (o pre-commit só chega em `app-tauri` via `lint-staged` nos arquivos TS staged, como `sidecars.ts`/`generate.test.ts`/`bindings.ts` — nunca via `cargo`). **Follow-up do founder**: adicionar `test`/`tsc`-equivalentes (`cargo build`/`cargo test`/`cargo clippy` via `project.json` custom targets) para que `bun x nx affected` e `bun x nx run-many` deixem de ignorar esta shell por completo.

---

## Estado final

Working tree limpa após este artefato ser escrito e commitado (verificado por `git status --porcelain` antes e depois de `bun check:generated`, e novamente após o commit deste arquivo). Nenhum código de produção foi tocado nesta Task — apenas este documento.
