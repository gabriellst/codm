# W2 — o runner das suítes que o `bun test` não alcança

> **Para workers agênticos:** passos com checkbox (`- [ ]`). Onda 2 de 4 — ver
> `.plans/2026-08-14-readequacao-codm-template.md` para o mapa. Depende da W1 fechada.

**Goal:** Trazer `scripts/test-native.ts` para o codm e, com ele, `test-liveness` — e descobrir
quais suítes nativas do codm hoje **não pertencem a runner nenhum**.

**Architecture:** Porte template → codm. Mas esta onda não é porte de gate: é porte de **runner**, e
o entregável mais valioso é o inventário que ele produz, não o arquivo.

**Spec:** `.plans/2026-08-14-readequacao-codm-template.md`

## Global Constraints

Iguais à W1 (exit sem pipe · testemunha antes · comparar contra a base vermelha · `--skip-nx-cache`
uma vez · caminho absoluto · nada pushed).

---

## Por que esta onda existe, e por que ela provavelmente acha algo

O docblock do `test-native.ts` do template registra a doença que o fez nascer:

> *"the hot path of this repo is bun-only ON PURPOSE: `bun run test` must stay green for a
> contributor who has neither Go nor Rust installed… The cost of that decision, measured on
> 2026-08-07, was that four native suites belonged to NO runner at all — `packages/contracts/
> generated/go` sat at `FAIL [build failed]` for 18 days, and `generated/rust/tests/slot.rs` plus
> the three `client/dist/rust/tests/*.rs` had never executed in CI once."*

**O codm tem Go e tem Rust (o shell Tauri), e não tem `test:native`.** A hipótese ERA que estivesse
no mesmo estado. A Task 1 existia para medir antes de portar — e mediu.

## CORREÇÃO da hipótese, medida antes da execução (2026-08-14)

O verificador de coerência e a medição direta derrubaram a premissa central: **o codm NÃO está no
estado do template.** Três das quatro suítes nativas já têm runner, e o `bun run test` daqui já
desce para `go` e `cargo`:

| suíte | runner hoje | evidência |
|---|---|---|
| `packages/api/go` (+ `core`) | `api-go:test` | `project.json:40` → `go test ./... && go -C core test ./...` |
| `packages/contracts/generated/go` | `@codm/contracts:test` | `package.json:26` → `… && bun run test:go` → `cd generated/go && go test ./...` |
| `packages/contracts/generated/rust` | `@codm/contracts:test` | idem → `test:rust` → `cargo test --manifest-path generated/rust/Cargo.toml` |
| `packages/client/dist/rust` | `client:test` | `project.json:41` → `bun run test:rust` → `cargo test --manifest-path dist/rust/Cargo.toml` |
| **`packages/app/tauri/src-tauri`** | **NINGUÉM** | `nx show project app-tauri` → targets `tauri, lint, generate, sidecars, dev, bundle`. Sem `test`, sem `test:rust`, sem script, e o `correctness.yml` só roda `detect`/`tsc`/`test` |

**O ACHADO É UM SÓ, e é o mais irônico possível:** a única suíte órfã é o shell Tauri, com **60
testes Rust** (58 unitários + 2 do rail de arquitetura `tests/no_raw_http.rs`, que proíbe `reqwest`
cru fora de `src/api/mod.rs`). Um GATE de arquitetura que nenhum runner roda. Rodado à mão pela
primeira vez: **EXIT=0, 60 passam.** Verde — mas nada os mantém verdes.

**E a razão do `test:native` do template NÃO se herda.** Lá o nome existe porque o caminho quente é
bun-only de propósito ("um contribuidor que não tem Go nem Rust instalados"). Aqui o `bun run test`
JÁ invoca `go test` e `cargo test` através dos targets nx acima. Então o entregável desta onda não é
um segundo runner por cima dos que existem: é **dar alvo ao órfão** (mesma forma do conserto de lint
da W1, "dar alvo lint aos 6") e trazer o `test-liveness`, que é o gate capaz de achar o próximo.

### Correções que o verificador exigiu no resto deste plano

1. **A premissa "mesmo estado do template" está morta** (tabela acima). O Step 4 da Task 1 encontra
   UM órfão, não quatro.
2. **O `binaries/` do src-tauri é gitignored e está populado nesta máquina.** O `NATIVE_EXEMPTIONS`
   do template diz que `cargo test` lá sai 101 antes de compilar por falta de sidecar; aqui não
   reproduz porque os binários existem localmente. Um verde local NÃO é evidência — se a exceção for
   avaliada, medir sem os binários.
3. **`scripts/graph/adapters/rust/extractor` NÃO EXISTE no codm** (só o `go/extractor`). A exceção
   correspondente sai no porte; copiá-la é embarcar ponteiro morto.
4. **Os campos `note`/`why` por suíte do `test-native.ts` são medições DO TEMPLATE.** Ex.: ele diz
   `client/dist/rust` = `tests/{builder,discriminated_union,enum_dedup}.rs`; aqui são
   `{builder,live_smoke,message_received_union}.rs`, e o `live_smoke.rs` tem um `#[ignore]` que exige
   backends de pé. Reescrever a prosa, não copiá-la.
5. **O `CORPORA` do `test-liveness.test.ts` nomeia `examples/pairs` e `examples/slices`.** O codm não
   tem `examples/` nenhum — o teste reprovaria no próprio auto-check por motivo alheio a órfão.
   Só `scripts/skill-evals/seeds` sobrevive.
6. **Forma de módulo verificada e OK:** `test-native.ts` guarda o runner com `if (import.meta.main)`
   (não executa ao importar) e os dois arquivos derivam `ROOT` de `import.meta.dirname`, não de
   `process.cwd()`. Nenhum dos dois defeitos que morderam o `run-all.ts` está presente.

---

### Task 1: o inventário — MEDIR antes de portar

**Files:** nenhum (só medição; o resultado vai para o relatório e para o plano)

- [ ] **Step 1: listar TODA suíte nativa do codm**

```bash
C=/Users/work/Desktop/Projetos/pessoal/codm; cd $C
find . -name '*_test.go' -not -path '*/node_modules/*' -not -path '*/.claude/worktrees/*' | sort
find . -name '*.rs' -path '*/tests/*' -not -path '*/node_modules/*' -not -path '*/target/*' | sort
```

- [ ] **Step 2: para CADA uma, responder: quem a roda hoje?**

Candidatos a runner no codm: `bun run test` (nx `run-many -t test`), o target `test` de cada
`project.json`, `.github/workflows/*`, e os scripts de `package.json`. Uma suíte que não aparece em
nenhum é órfã.

```bash
python3 -c "import json;d=json.load(open('package.json'))['scripts'];print('\n'.join(f'{k} -> {v}' for k,v in d.items() if 'test' in k))"
grep -rn 'go test\|cargo test' .github/ package.json packages/*/project.json packages/*/*/project.json 2>/dev/null | grep -v node_modules
```

- [ ] **Step 3: RODAR cada órfã, e colar a saída**

Este é o falseador da onda. Se uma órfã estiver vermelha, ela está vermelha **há quanto tempo
ninguém sabe** — e esse é o achado, não o porte.

```bash
cd packages/api/go && go test ./... ; echo "EXIT=$?"
cd packages/contracts/generated/go && go test ./... ; echo "EXIT=$?"
cd packages/app/tauri/src-tauri && cargo test ; echo "EXIT=$?"
```
(Ajuste os caminhos ao que o Step 1 realmente listou — não presuma que os do template existem aqui.)

- [ ] **Step 4: escrever o veredito, por suíte**

Tabela no relatório: suíte · runner que a executa hoje · estado quando rodada à mão. **Se a resposta
for "ninguém" para alguma, isso é ACHADO** e entra no commit, não em backlog.

---

### Task 2: portar `test-native.ts`

**Files:** Create `scripts/test-native.ts`; Modify `package.json` (script `test:native`)

- [ ] **Step 1: portar e ler antes de rodar**

```bash
T=/Users/work/Desktop/Projetos/pessoal/template-fullstack
cp $T/scripts/test-native.ts scripts/test-native.ts
```

O arquivo do template lista suítes **do template** (contracts/generated/go, generated/rust,
client/dist/rust). O codm tem outro conjunto — medido na Task 1. **Adaptar a lista é o trabalho;
copiar a lista é o erro.** Se alguma suíte do template não existir aqui, ela sai; se o codm tiver
uma que o template não tem, ela entra.

- [ ] **Step 2: rodar**

```bash
bun scripts/test-native.ts > /tmp/n.txt 2>&1; echo "EXIT=$?"
```

- [ ] **Step 3: registrar o script**

```json
"test:native": "bun scripts/test-native.ts"
```

- [ ] **Step 4: TESTEMUNHA — o runner tem de saber reprovar**

Quebre uma suíte de propósito (um `t.Errorf` temporário num `_test.go` qualquer), rode
`bun test:native`, prove que fica RED nomeando a suíte, restaure. Cole a saída. Um runner que
agrega e nunca reprovou não agrega nada.

- [ ] **Step 5: commitar**

---

### Task 3: `test-liveness`

**Files:** Create `scripts/test-liveness.test.ts`; Modify `package.json` (`test:tooling`)

- [ ] **Step 1: portar e rodar**

```bash
cp $T/scripts/test-liveness.test.ts scripts/test-liveness.test.ts
bun test scripts/test-liveness.test.ts > /tmp/tl.txt 2>&1; echo "EXIT=$?"
```

Ele importa `./test-native` — por isso vem depois da Task 2. Confira a FORMA DE MÓDULO: o
`test-native.ts` exporta o que o teste importa, ou executa no topo? Se executar, aplique
`import.meta.main` (foi exatamente o defeito do `run-all.ts` no GOAL 1).

- [ ] **Step 2: TESTEMUNHA** — desligue uma regra, prove RED nomeando-a, restaure.

- [ ] **Step 3: bateria completa e commit**

Mesma lista da W1, Task 3, Step 4, mais:
```bash
cd packages/api/go && go build ./... ; echo "EXIT=$?" && go test ./... ; echo "EXIT=$?"
bun test:native ; echo "EXIT=$?"
```

## O que esta onda deliberadamente NÃO faz

- Não conserta suíte órfã que esteja vermelha, se o conserto não for óbvio. O achado é o
  entregável; o conserto ganha plano próprio com o defeito nomeado.
- Não adota o `test:rust` como target separado se o codm não tiver a mesma razão do template — a
  decisão de nome lá veio de "contribuidor sem Rust instalado", e o codm precisa dizer se herda
  essa restrição.

---

## FECHAMENTO DA W2 — 2026-08-14 · commit `192f8ce9`

### Veredito por suíte nativa (condição 4)

| suíte | runner ANTES | runner AGORA | estado |
|---|---|---|---|
| `packages/api/go` + `core` | `api-go:test` | igual | verde |
| `packages/contracts/generated/go` | `@codm/contracts:test` | igual | verde |
| `packages/contracts/generated/rust` | `@codm/contracts:test` | igual | verde |
| `packages/client/dist/rust` | `client:test` | igual | verde |
| **`packages/app/tauri/src-tauri`** | **NINGUÉM** | **`app-tauri:test`** | verde (60 testes) |

**"Ninguém" apareceu uma vez, e num gate:** o `tests/no_raw_http.rs` é o rail de arquitetura que
proíbe `reqwest` cru fora de `src/api/mod.rs`. Um gate que nenhum runner rodava.

### O achado maior: 22 arquivos de teste órfãos

- **8 eram FALSOS** — defeito do parser do próprio rail, cego a `cd X && …` e a `--manifest-path`.
  O lado perigoso: um falso órfão ensina a responder o gate com exceção.
- **12 reais, fechados com runner** — `scripts/og`, `scripts/release`, `packages/client/lib` e o
  próprio `test-liveness`.
- **9 reais, fechados em seguida** — `scripts/graph/tests/`. Levantados primeiro como PARE COM ACHADO
  (`UNRUN_TESTS` com o why medido); depois de diagnosticados o conserto coube e foi feito em
  `c91041cb`. `UNRUN_TESTS` voltou a `[]`.

### O PARE COM ACHADO, e como ele fechou (`c91041cb`)

63 testes, vermelhos desde 2026-07-21, nunca rodados por nada. Duas causas independentes:

1. **Fixtures que nunca existiram aqui.** `.specs/2026-05-13-agentic-coding-system-design.md` e
   `.plans/2026-05-13-agentic-coding-system-bootstrap.md` — `git log --all --diff-filter=A` vazio.
   O cabeçalho do próprio teste já admitia ("re-fixture before un-skipping"). Conserto: fixture
   local sob `__fixtures__/`, que é o padrão que os outros testes do mesmo arquivo já usam.
2. **`validatePlan` degrada em silêncio.** PR-18 e PR-19 dependem de `.graph/graph.json`, que é
   gitignored, nasce de `bun cli graph build` e não é reconstruído por alvo nenhum — e a ausência é
   engolida num `catch` pelado. Em clone novo as duas regras simplesmente não rodam, sem sinal.
   É a mesma família de vacuidade que esta sessão vem medindo, num validador de planos.

**RESOLVIDO — `c91041cb`.** Diagnosticado, o conserto coube e não precisou de plano próprio:

- **As três fixtures** viraram fixtures locais sob `__fixtures__/`, que é o padrão que os outros
  testes do mesmo diretório já usavam. Contagens viraram exatas (`toBe`, não `>=`) — a fixture
  pertence ao teste, então deriva é defeito, não crescimento. E o `plan-net-new-dependency.md` foi
  re-apontado para entidades reais desta árvore: era o contexto **`finance`**, que não existe aqui,
  o que fazia todo `Modify` ler como net-new e o PR-19 não ter cadeia pure-modify para julgar.
- **O auto-skip morreu.** `describeIf = hasFixture ? describe : describe.skip` virava fixture
  ausente em passe silencioso. Sem guard agora: se a fixture sumir, o read **lança**.
- **O degrade silencioso virou ruído.** `ValidationResult` ganhou `skipped: string[]`, o `exitCode`
  deixa de ser 0 quando uma regra não foi avaliada, e o CLI imprime `NOT EVALUATED:` em vez de `OK`.
  Ganhou teste — e não podia ter antes, porque não havia costura: `validatePlan` recebe um segundo
  parâmetro opcional cujo **default é o loader real**, e o teste passa um thrower.

Resultado: **65 pass, 0 fail, ZERO skip** (era 3 fail / 5 skip), `scripts/graph/tests` dentro do
`test:tooling`, e `UNRUN_TESTS` de volta a `[]`.

### Condição (3) GO-SHARING — por que esta onda não criou regra de skill

Não criou, e a razão é a natureza da entrega: a W2 produziu **runners e um rail de tooling**, não uma
regra sobre como escrever artefato de domínio. Não há checklist de `entity`/`repository`/`handler`
que mude por causa dela — o que mudou foi *quem executa o que*, que vive em `project.json` e
`package.json`, não em `registry.yaml`. Criar uma entrada de skill só para satisfazer a condição
seria a cerimônia que este programa recusa em toda onda.

### O que a W2 deliberadamente NÃO fez

- **Não portou `test-native.ts`.** As suítes nativas daqui são alvos nx comuns; um segundo runner
  faria o rail provar alcance contra uma lista que nada executa.
- **Não consertou `scripts/graph/tests`.** O achado é o entregável; o conserto tem defeito nomeado
  e pede plano próprio.
