# O Eixo de Ambiente no Go — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`) syntax for tracking.
> Each Task wraps one observable behavior in an outer RED→GREEN cycle. Blocos de código são a forma
> final INTENCIONAL; verifique nomes de símbolos contra o código real — ajuste FIAÇÃO, nunca o
> contrato congelado, e registre ajustes no relato.

**Goal:** Qualquer serviço Go do template herda o eixo de ambiente como base do core-go (`registry.Env/App/Refuse/Validate`); o gateway ganha canal roteirizado, testes reais (Go-interno, e2e, harness do console via `services: ['apiGo']`), e o CODM_E2E/TestIngress morrem.

**Architecture:** `core/registry` compõe app fx = módulo base (real) + overlay da coluna (`map[Env]fx.Option`, "só quem diverge declara"), selecionado por `CODM_ENV`. O `MockChannel` (segunda implementação da porta `gateway.Channel` existente) produz QR/pareamento/contatos/inbound PELOS pipelines reais — matando o testseam de injeção de eventos. `testenv.Start` (core) dá harness Go-interno; o manifesto declara a receita de boot que o harness TS usa para subir o gateway como subprocesso sobre o mesmo SQLite; o e2e ganha o gateway como terceiro webServer.

**Tech Stack:** Go + fx + whatsmeow, TypeScript, Bun, Playwright, SQLite

**Spec:** .specs/2026-08-10-eixo-ambiente-go-design.md
**Tasks:** 11
**Estimated minutes:** 395

---

## Task T0: PR-27 consulta a capacidade de generator por linguagem (conserto de tooling)

**Files to write:**
- Modify: `scripts/graph/cli/` — a regra PR-27 do validate-plan passa a consultar a capacidade de generator da linguagem do path (declarada — a mesma fonte que `bun cli --help` usa para dizer "go: NOT YET implemented"; localizar onde essa capacidade vive em `scripts/cli/` e EXPOR como propriedade consultável, nunca um `if (lang === 'go')` hardcoded na regra)
- Test: fixture negativa no teste do validate-plan (se existir suite; senão, criar caso mínimo): plano com artefato novo em lang SEM generator → PR-27 não dispara; artefato novo em lang COM generator sem scaffold step → PR-27 dispara (o comportamento atual preservado)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)

### Step T0.1 — Localizar a declaração de capacidade, expor, consultar na regra, fixture, gates

RATIONALE (NN-5 + house rule do CLI): PR-27 hoje dispara por tipo de artefato sem consultar se a linguagem TEM scaffolder — flagou o mock Go deste plano exigindo `bun cli service` que não existe para Go. A informação já está declarada (o help do CLI a imprime); a regra passa a fazer lookup nela. Run: `bun scripts/graph/cli/index.ts validate-plan .plans/2026-08-10-eixo-ambiente-go.md` → exit 0 após o fix.

```bash
git add scripts/
git commit -m "fix(graph): PR-27 consulta capacidade de generator por lang — Go sem scaffolder é exempt declarado (T0)"
```

**Convenção de commit:** cada Task commita ao fechar; a base core-go (T1) e o rename (T2) são commits portáveis isolados.

---

## Task T1: O core-go ganha o eixo — registry.Env, App, Refuse, Validate

**Files to write:**
- Create: `packages/api/go/core/registry/registry.go`
- Create: `packages/api/go/core/registry/validate.go`
- Test: `packages/api/go/core/registry/registry_test.go`
- Modify: `packages/api/go/core/config/config.go` — campo `Env registry.Env` lido de `CODM_ENV` (default `real`); a flag `TestIngress` e seu guard PERMANECEM (T4 os mata — este task não toca o channel)
- Modify: `packages/api/go/core/module.go` — `StartHTTPServer` aceita porta 0 e loga/reporta a porta efetiva (ler a implementação atual primeiro; o mecanismo Go canônico: `net.Listen("tcp", ":"+port)` → `listener.Addr().(*net.TCPAddr).Port` → `http.Serve(listener, handler)`)

**Files to read:**
- `packages/api/go/core/config/config.go` (shape do Load + enum Environment de deploy)
- `packages/api/go/core/module.go` (StartHTTPServer atual)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** (none)

### Step T1.1 — Testes que falham (registry_test.go)

```go
package registry_test

// Casos (TDD — escrever primeiro, ver falhar):
// 1. App(env, base, overlays) devolve fx.Option contendo base + overlays[env]; coluna ausente => só base.
// 2. Refuse(EnvE2e, deployPRODUCTION) => erro; Refuse(EnvReal, deployPRODUCTION) => nil;
//    Refuse(EnvIntegration, deployDEVELOPMENT) => nil. (FALSEADOR do fail-closed.)
// 3. Env inválido em ParseEnv => erro nomeado (nunca default silencioso para valor desconhecido;
//    ausente/"" => EnvReal).
```

### Step T1.2 — Proposed file (registry.go)

```go
// packages/api/go/core/registry/registry.go — COMPLETE final file
// O EIXO DE AMBIENTE do template para serviços Go — espelho do core-typescript
// (BoundedContext.ts + Registry.ts): a base é o módulo `real`; cada ambiente é um
// overlay que declara SÓ quem diverge (fx.Replace/fx.Decorate). A lição da frente
// TS (auditoria 11/14 tokens): e2e é real-menos-processos-externos — por isso a
// base é real, e não existe cadeia de herança entre colunas.
// ZERO símbolos de serviço aqui — channel/codm/whatsmeow não aparecem (spec AC-1).
package registry

import (
	"fmt"

	"go.uber.org/fx"
)

type Env string

const (
	EnvReal        Env = "real"
	EnvIntegration Env = "integration"
	EnvE2e         Env = "e2e"
)

// Overlays mapeia coluna → opções fx que substituem providers da base.
type Overlays map[Env]fx.Option

// ParseEnv valida CODM_ENV. Vazio => real (produção não precisa declarar);
// valor desconhecido => erro alto, nunca fallback silencioso.
func ParseEnv(raw string) (Env, error) {
	switch Env(raw) {
	case "":
		return EnvReal, nil
	case EnvReal, EnvIntegration, EnvE2e:
		return Env(raw), nil
	}
	return "", fmt.Errorf("CODM_ENV inválido: %q (válidos: real, integration, e2e)", raw)
}

// App compõe o app do serviço: base (real) + a coluna selecionada.
func App(env Env, base fx.Option, overlays Overlays) fx.Option {
	if overlay, ok := overlays[env]; ok {
		return fx.Options(base, overlay)
	}
	return base
}

// Refuse é o fail-closed do template (espelho do falseador do TS): um ambiente
// de teste sob deploy PRODUCTION recusa o boot — um servidor de produção com
// bindings de teste seria o desastre silencioso.
// deployEnv é o Environment de DEPLOY do config (eixo distinto deste).
func Refuse(env Env, deployIsProduction bool) error {
	if env != EnvReal && deployIsProduction {
		return fmt.Errorf("CODM_ENV=%s é recusado sob ENVIRONMENT=PRODUCTION — bindings de teste não sobem em produção", env)
	}
	return nil
}
```

### Step T1.3 — Proposed file (validate.go)

```go
// packages/api/go/core/registry/validate.go — COMPLETE final file
// O RAIL: fx.ValidateApp constrói o grafo inteiro de uma coluna sem executar
// lifecycle — provider faltando quebra no CI, não no boot (spec AC-5).
package registry

import (
	"testing"

	"go.uber.org/fx"
)

// Validate roda fx.ValidateApp para cada coluna declarada + real. Chame do
// *_test.go do serviço, passando a MESMA composição do main.
func Validate(t *testing.T, base fx.Option, overlays Overlays, extra ...fx.Option) {
	t.Helper()
	for _, env := range []Env{EnvReal, EnvIntegration, EnvE2e} {
		env := env
		t.Run(string(env), func(t *testing.T) {
			opts := append([]fx.Option{App(env, base, overlays)}, extra...)
			if err := fx.ValidateApp(opts...); err != nil {
				t.Fatalf("grafo fx inválido na coluna %s: %v", env, err)
			}
		})
	}
}
```

### Step T1.4 — Config + StartHTTPServer

`config.go`: campo `Env registry.Env` populado por `registry.ParseEnv(getEnvOrDefault("CODM_ENV", ""))` (erro de parse falha o Load). `module.go`: porta efêmera conforme o mecanismo do Step-header — a assinatura pública que outros consomem não quebra (verificar consumidores por grep antes).

### Step T1.5 — Gates + commit

Run: `cd packages/api/go && go test ./core/... && go vet ./... && go build ./...`
Expected: PASS, 0 issues. Falseador de Refuse registrado no relato (caso 2 RED→GREEN durante TDD).

```bash
git add packages/api/go/core/
git commit -m "feat(core-go): eixo de ambiente — registry.Env/App/Refuse/Validate + CODM_ENV (T1)"
```

---

## Task T2: O pool ganha seu nome verdadeiro — ChannelRegistry vira pool.ChannelPool

**Files to write:**
- Rename: `packages/api/go/internal/channel/services/registry/` → `packages/api/go/internal/channel/services/pool/` (package `pool`; `ChannelRegistry` → `ChannelPool`; `NewChannelRegistry` → `NewChannelPool`)
- Sweep: os ~38 arquivos consumidores (localizar: `grep -rln "services/registry" internal/`) — imports + referências de tipo, MECÂNICO, compilador guia

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service
**Depends on:** (none)
**Consumes (frozen):** nada — rename puro. RAZÃO (do brainstorm, founder-approved): a interface é `Register/Get/Remove/DisconnectAll/Count` sobre instâncias VIVAS — um pool; e `registry` vira vocabulário reservado do eixo nas duas linguagens (harmonização de linguagem ubíqua, CLAUDE.md).
**Scope fence:** ZERO mudança de comportamento/assinatura além do nome; OUT — core/registry (T1), overlays (T4).
**Gate:** `cd packages/api/go && go build ./... && go test ./... && go vet ./...` — tudo verde; `grep -rn "ChannelRegistry\|services/registry" internal/ --include="*.go"` → 0.

### Step T2.1 — Rename mecânico + gates + commit

`git mv` do diretório, sed dos símbolos, compilador aponta o resto.

```bash
git add packages/api/go/
git commit -m "refactor(channel): ChannelRegistry vira pool.ChannelPool — registry é vocabulário do eixo (T2)"
```

---

## Task T3: O canal roteirizado existe — MockChannel produz QR/pareamento/inbound determinísticos

**Files to write:**
- Create: `packages/api/go/internal/channel/services/gateway/mock/scenario.go` — o roteiro declarado no boot
- Create: `packages/api/go/internal/channel/services/gateway/mock/channel.go` — MockChannel
- Create: `packages/api/go/internal/channel/services/gateway/mock/factory.go` — MockChannelFactory
- Test: `packages/api/go/internal/channel/services/gateway/mock/channel_test.go`

**Files to read:**
- `packages/api/go/internal/channel/services/gateway/gateway.go` (a porta COMPLETA — as ~25 assinaturas exatas de `Channel` + `ChannelFactory` + tipos `QRCodeData`/`SendMessageParams`/`ContactSnapshot` etc.)
- `packages/api/go/internal/channel/services/gateway/whatsapp/` (um método do adaptador real como exemplar de forma)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)
**Consumes (frozen):** a porta `gateway.Channel`/`gateway.ChannelFactory` EXISTENTE (gateway.go:124/:181) — implementar EXATAMENTE as assinaturas dela, nunca alterá-la. Spec D5/D6: fatos pelos pipelines reais; roteiro declarado no boot; NENHUM endpoint de comando.
**Scope fence:** OUT — overlay/module/main (T4); testseam (T4 mata); qualquer mudança na porta. O mock NÃO conhece mediator/outbox — ele só implementa a porta; quem propaga fatos é o pipeline real que o consome (mapper de connected, ingest), exatamente como com o whatsmeow.
**Gate:** `cd packages/api/go && go test ./internal/channel/services/gateway/mock/... && go vet ./... && go build ./...`.

### Step T3.1 — Scenario (proposed shape)

```go
// packages/api/go/internal/channel/services/gateway/mock/scenario.go — a forma (executor adapta aos tipos reais da porta)
package mock

import "time"

// Scenario é o roteiro DECLARADO NO BOOT (spec D6 — determinismo sem plano de
// controle runtime). Zero-value = canal que conecta e pareia imediatamente sem
// contatos nem mensagens.
type Scenario struct {
	// QRFrames emitidos por GetQRChannel antes do pareamento (enlatados).
	QRFrames []string
	// AutoPairAfter: tempo após Connect até o roteiro "escanear" — dispara o
	// MESMO caminho que o telefone dispararia (o evento de sucesso que o mapper
	// real de connected consome). 0 = pareia imediatamente.
	AutoPairAfter time.Duration
	// Contacts servidos por StreamContactSnapshot pós-sync (atravessam o sync real).
	Contacts []ContactSeed
	// InboundMessages emitidas após conectar (atravessam o ingest real).
	InboundMessages []InboundSeed
}
// ContactSeed/InboundSeed: structs mínimos espelhando os campos que
// gateway.ContactSnapshot / o ingest realmente consomem — derivar da porta, não inventar.
```

### Step T3.2 — MockChannel + factory (a regra de implementação)

Núcleo SCRIPTADO (comportamento real assertável): `Connect` (status CONNECTING→ emite QR frames → auto-pareia conforme roteiro), `Status`, `GetQRChannel`, `Disconnect`/`Logout`, `SendMessage` (resultado determinístico: id derivado do input, nunca random), `StreamContactSnapshot` (serve `Scenario.Contacts`), identidade (`GetOwnerRemoteID`/`GetChannelID`/`GetDeviceID` — derivados do config/uuid do Create), `IsGroupJID` (heurística de sufixo real). TODOS os demais métodos da porta: no-op honesto (retorno zero-value + `nil`), com UM comentário de pacote explicando a política ("cresce por demanda de teste, nunca especulativamente"). **CRÍTICO — como o auto-pareamento alcança o mapper real:** ler como o adaptador whatsmeow entrega o evento de pareamento ao pipeline (o canal de eventos que `connected.go` consome) e fazer o mock entregar pelo MESMO canal/callback — se a porta não expõe esse caminho (só o adaptador interno), o mock replica o que o whatsmeow faz por fora da porta (registrar handler etc.); se isso se provar impossível sem tocar a porta, PARE e reporte NEEDS_CONTEXT com o acoplamento encontrado.

### Step T3.3 — Testes (TDD): QR frames na ordem do roteiro; auto-pareamento após o delay; SendMessage determinístico (mesmo input → mesmo id); snapshot serve os contatos do roteiro. Falseador: quebrar a ordem dos frames → RED.

### Step T3.4 — Gates + commit

```bash
git add packages/api/go/internal/channel/services/gateway/mock/
git commit -m "feat(channel): MockChannel roteirizado — QR/pareamento/inbound pelos pipelines reais (T3)"
```

---

## Task T4: O gateway boota pelo eixo; CODM_E2E e o testseam morrem

**Files to write:**
- Modify: `packages/api/go/cmd/api/main.go` — casca: `env` do config → `registry.App(env, base, channel.Overlays)` (base = core.Module + shared.Module + channel.Module, como hoje)
- Create: `packages/api/go/internal/channel/overlay.go` — `channel.Overlays registry.Overlays`: `integration` e `e2e` trocam SÓ o `ChannelFactory` (fx.Replace → MockChannelFactory); comentário citando por que o store NÃO troca (deriva de CODM_DATA_DIR)
- Modify: `packages/api/go/internal/channel/module.go` — a montagem condicional do testseam morre
- Delete: `packages/api/go/internal/channel/testseam/`
- Modify: `packages/api/go/core/config/config.go` — `TestIngress` e o guard CODM_E2E morrem; entra `registry.Refuse(cfg.Env, cfg.Environment == enums.EnvironmentProduction)` no Load
- Test: `packages/api/go/cmd/api/main_test.go` — o rail: `registry.Validate(t, base, channel.Overlays)` (AC-5)
- Modify: `template.config.ts` — entrada `CODM_E2E` morre; `CODM_ENV` ganha `consumers: ['apiTs','apiGo']` (respeitar a gramática STAMP-MANAGED — o gate é `scripts/create-template/render-manifest.test.ts` + rails ENV-01/ENV-04; regenerar `.env.example` via `bun env:generate` se a renderização mudar)
- Modify: `packages/api/typescript/scripts/phase3-smoke.ts`, `phase6-mcp-smoke.ts`, `smoke-shared-store.ts` — refs mortas de CODM_E2E (ler cada uma: se o script está morto/stale, atualizar a ref para CODM_ENV=e2e; NUNCA deletar script sem verificar consumidor)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T1, T2, T3
**Consumes (frozen):** `registry.Env/App/Refuse/Validate/Overlays` + `config.Env` (T1); `mock.NewMockChannelFactory` + `mock.Scenario` (T3); `pool.ChannelPool` (T2). O e2e do gateway precisa de cenário: o overlay `e2e` provê um `Scenario` default parametrizável por env/config declarado (decisão de fiação: campo config `MockScenarioPath` ou Scenario default embutido — escolher o mais simples que sirva T10, documentar).
**Scope fence:** OUT — testenv (T5), harness TS (T7), e2e Playwright (T10). O adaptador whatsmeow intocado.
**Gate:** `cd packages/api/go && go test ./... && go vet ./... && go build ./...` verde (rail incluso, falseado: remover um provider → RED → restaurar); `grep -rn "CODM_E2E" packages/ template.config.ts --include="*.go" --include="*.ts" | grep -v node_modules | grep -v "\.specs/\|\.plans/"` → 0; boot smoke: `CODM_ENV=integration CODM_DATA_DIR=$(mktemp -d) PORT=0 timeout 10 go run ./cmd/api` sobe e loga porta efetiva.

### Step T4.1 — Ordem: overlay → main → mortes → rail → manifesto → smokes → gates → commit

```bash
git add packages/api/go/ template.config.ts .env.example packages/api/typescript/scripts/
git commit -m "refactor(api-go): gateway boota pelo eixo; CODM_E2E e testseam morrem (T4)"
```

---

## Task T5: testenv no core + o fluxo de QR tem teste real

**Files to write:**
- Create: `packages/api/go/core/pkg/testenv/testenv.go` — `Start(t, env, opts)`: `CODM_DATA_DIR` temp + `PORT=0` via env do processo de teste (t.Setenv), fx app com `registry.App` + lifecycle start, `t.Cleanup(stop)`, retorna `{URL string, DB *sql.DB}` (o handle do SqliteStore); recebe `base fx.Option, overlays registry.Overlays` — genérico, zero import de channel (AC-1 vale aqui também)
- Test: `packages/api/go/internal/channel/qr_pairing_test.go` — AC-3

**Files to read:**
- `packages/api/go/core/module.go` (lifecycle/StartHTTPServer pós-T1)
- `packages/api/go/internal/channel/services/gateway/whatsapp/mapper/connected.go` (o mapper que o auto-pareamento atravessa)
- `packages/api/go/internal/channel/usecases/connect_channel.go` (o caminho CONNECTING)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T1, T4
**Consumes (frozen):** `registry.App/Overlays` (T1), `channel.Overlays` + boot por coluna (T4), `mock.Scenario` (T3). O teste usa `env=integration` com cenário de QR+auto-pareamento.
**Scope fence:** OUT — inbound (T6), cross-service (T7+). testenv não conhece channel; o TESTE (no pacote channel) compõe.
**Gate:** `cd packages/api/go && go test ./internal/channel/ -run TestQRPairing -v` verde E falseado (quebrar o mapper de connected transitoriamente → RED → restaurar byte-a-byte, contagens no relato); `go test ./...` inteiro verde.

### Step T5.1 — O teste (forma)

```go
// AC-3: conectar → frames de QR do roteiro → auto-pareamento → mapper REAL →
// gateway_connected no outbox REAL → projeção CONNECTED.
// Setup: testenv.Start(t, registry.EnvIntegration, base, overlaysComCenario)
// Act: POST /channels + connect via HTTP real (o mesmo caminho do console)
// Assert por condição (poll com deadline, nunca sleep fixo):
//   1. status do canal projeta CONNECTED (GET real)
//   2. shared_outbox contém gateway_connected (query no DB handle)
```

### Step T5.2 — Gates + commit

```bash
git add packages/api/go/core/pkg/testenv/ packages/api/go/internal/channel/qr_pairing_test.go
git commit -m "feat(core-go): testenv.Start + o fluxo de QR tem teste real (T5)"
```

---

## Task T6: Emissão de eventos inbound tem teste real

**Files to write:**
- Test: `packages/api/go/internal/channel/inbound_emission_test.go` — AC-4

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T5
**Consumes (frozen):** `testenv.Start` (T5), `mock.Scenario.InboundMessages` (T3). Cenário: canal conecta + emite N mensagens inbound → atravessam o ingest REAL.
**Scope fence:** OUT — tudo o mais. Asserções: projeção de mensagem materializada + linha de outbox com lane/source corretos consumível pelo `sql_external_mediator` (asserção na ROW, o mediator real já tem testes próprios).
**Gate:** `go test ./internal/channel/ -run TestInboundEmission -v` verde e falseado (quebrar o ingest → RED); `go test ./...` verde.

### Step T6.1 — Teste + gates + commit

```bash
git add packages/api/go/internal/channel/inbound_emission_test.go
git commit -m "test(channel): emissão inbound atravessa ingest real até projeção+outbox (T6)"
```

---

## Task T7: O harness do console sobe serviços declarados no manifesto (SPIKE do reset primeiro)

**Files to write:**
- Modify: `template.config.ts` — workspaces participantes ganham receita de boot testável declarada (ex.: campo `testBoot: { build: string; command: string; env: (ctx: {port, dataDir}) => Record<string,string> | shape declarativa equivalente; healthPath: string }` no `apiGo`) — DESENHAR a shape mais declarativa que a gramática STAMP-MANAGED aceitar; o gate `render-manifest.test.ts` decide
- Modify: `packages/api/typescript/src/server.ts` — `start()` ganha opção `dataDir?: string`: sob `integration`, o driver usa arquivo `codm.db` nesse dir em vez do temp interno (mecanismo: ler como o driver de integration nasce hoje e parametrizar por DECLARAÇÃO — provavelmente via a mesma via que FileLibsqlDriver usa Config; se exigir env var antes do import de core, replicar o padrão documentado do harness antigo)
- Modify: `packages/api/typescript/tests/support/testing.ts` — `startIntegrationBackend({ services?: WorkspaceId[] })`: quando presente, cunha scratch dir, chama `start({env:'integration', port:0, dataDir})`, e para cada serviço: resolve a receita do manifesto por lookup (`REPO.workspaces[id].testBoot`), builda uma vez por processo (cache), spawna com env da receita (porta livre escolhida pelo harness + `CODM_ENV=e2e` + `CODM_DATA_DIR=scratch`), espera health, registra kill no stop(). ZERO nome de serviço hardcoded (AC-6/D9)
- Modify: `packages/api/typescript/testing.d.ts` — superfície atualizada (gate satisfies + paridade de nomes seguem verdes)
- Test: `packages/api/typescript/tests/support/cross-service.spike.test.ts` — AC-6: seed roteirizado no gateway visível por query do lado TS na MESMA run; e o VEREDITO DO SPIKE do reset() (ver Step T7.1)

**Files to read:**
- `template.config.ts` (gramática STAMP-MANAGED + tipos WORKSPACES)
- `packages/api/typescript/tests/support/testing.ts` + `src/server.ts` atuais
- `packages/e2e/scripts/run-e2e.ts` (o precedente de scratch dir + build do daemon)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** opus
**Skills:** /test, /sdk
**Depends on:** T4
**Consumes (frozen):** gateway bootável por `CODM_ENV=e2e` + porta efêmera + `CODM_DATA_DIR` (T4); `start({env, port})` do TS (frente anterior); `startIntegrationBackend`/`IntegrationBackend` (superfície pública — MANTER contrato, só estender). Model opus: RATIONALE — o spike do reset() cross-processo + o desenho da receita no manifesto são os dois pontos de maior incerteza da frente (PR-25).
**Scope fence:** OUT — lado react (T8), migrações (T9), e2e (T10). O default SEM `services` fica byte-idêntico em comportamento e tempo (medir e registrar).
**Gate:** spike test verde; `cd packages/api/typescript && bun test && bun x tsc -p tsconfig.build.json --noEmit` + `bun testing:check-dts` verdes; tempo de boot TS-only antes×depois registrado; **VEREDITO DO SPIKE no relato**: reset() cross-processo — truncate do lado TS limpa as tabelas do gateway? o gateway tolera (estado em memória não corrompe o próximo teste) ou o harness precisa re-spawnar? Medir custo das duas vias e ESCOLHER com números (a escolha vira contrato para T8/T9).

### Step T7.1 — Spike do reset ANTES de fechar a API: subir TS+gateway no mesmo arquivo, semear via cenário, `reset()`, semear de novo — o segundo teste vê estado limpo e o gateway continua funcional? Registrar RED/GREEN de cada via testada.

### Step T7.2 — Implementação + gates + commit

```bash
git add template.config.ts packages/api/typescript/
git commit -m "feat(testing): harness sobe serviços declarados no manifesto — gateway no mesmo SQLite (T7)"
```

---

## Task T8: O console consome os serviços; a fronteira aprende o vocabulário novo

**Files to write:**
- Modify: `packages/app/react/tests/support/integration-harness.ts` — `useIntegrationBackend({ services })` pass-through; sob opt-in a URL do Go no `configureClient` aponta pro subprocesso real; SEM opt-in o stub 501 continua, mensagem atualizada ("opte por services: ['apiGo'] — ver spec D11")
- Modify: `packages/app/react/tests/architecture/go-boundary.test.ts` — os DOIS casos (AC-8): sem opt-in → 501 com a mensagem nova; com opt-in → endpoint Go real responde
- Modify: `packages/app/react/tests/support/integration-harness.spike.test.tsx` — se a superfície mudou, acompanhar (asserções preservadas)

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook, /test
**Depends on:** T7
**Consumes (frozen):** `startIntegrationBackend({services})` + o veredito do reset (T7 — o mecanismo escolhido é LEI aqui); ids de workspace do manifesto (`'apiGo'`).
**Scope fence:** OUT — migrações de componente (T9); backend (T7 committed).
**Gate:** `cd packages/app/react && bun test && bun x tsc --noEmit` verdes; go-boundary falseado nos dois casos (apontar go→backend.url sem opt-in → RED; matar o subprocesso com opt-in → RED).

### Step T8.1 — Implementação + gates + commit

```bash
git add packages/app/react/tests/
git commit -m "feat(console): harness com services declarados; fronteira 501 aprende o caminho novo (T8)"
```

---

## Task T9: Os 3 só-visuais viram testes de comportamento (o payoff)

**Files to write:**
- Modify: `packages/app/react/src/routes/attach/-components/ContactStep/index.test.tsx` + `index.stories.tsx` — lista de contatos REAL via snapshot do cenário; stories só-visuais correspondentes reduzidas/substituídas pela regra de fronteira
- Modify: `packages/app/react/src/routes/(app)/threads/$threadId/-components/SessionChatSection/index.test.tsx` + `index.stories.tsx` — volume de transcript real via mensagens roteirizadas
- Modify: `packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.test.tsx` e `packages/app/react/src/components/Header/UserProfile/index.test.tsx` — `channelDone` real via pareamento roteirizado

**Agent:** frontend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /storybook, /test
**Depends on:** T8
**Consumes (frozen):** `useIntegrationBackend({ services: ['apiGo'] })` (T8); `mock.Scenario` semeado via receita/cenário (o mecanismo que T7 fechou); o protocolo de migração da frente de consolidação (falsear → migrar → asserção equivalente ou mais forte, mapa sobrevivente↔destino no commit).
**Scope fence:** OUT — qualquer outro componente; tooling. Asserções NOVAS são bem-vindas (cobertura que não existia — AC-7 pede falseamento de cada uma: quebrar o pipeline → RED).
**Gate:** `cd packages/app/react && bun test && bun x tsc --noEmit` verdes; 3 falseamentos registrados (RED com pipeline quebrado → restaurado → GREEN); tempo da suíte react registrado (o opt-in não pode contaminar o default — testes sem services continuam rápidos).

### Step T9.1 — Migração por componente + gates + commit

```bash
git add packages/app/react/src/
git commit -m "test(console): os 3 gateway-owned viram comportamento real — ContactStep, SessionChat, channelDone (T9)"
```

---

## Task T10: O e2e sobe o gateway; a tela de QR vira spec

**Files to write:**
- Modify: `packages/e2e/playwright.config.ts` — terceiro webServer: build + run do gateway (`CODM_ENV=e2e`, `CODM_DATA_DIR` do scratch compartilhado, porta pinada como os outros dois); seguir o formato dos dois existentes
- Modify: `packages/e2e/scripts/run-e2e.ts` — env/portas do gateway no runner
- Create: `packages/e2e/tests/12-channel-qr.spec.ts` — AC-9: console conecta canal → QR do roteiro aparece na tela → auto-pareamento → CONNECTED visível

**Files to read:**
- `packages/e2e/playwright.config.ts` + `scripts/run-e2e.ts` inteiros
- um spec vizinho (`11-artifact-preview.spec.ts`) como exemplar de forma

**Agent:** qa-tester
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /e2e
**Depends on:** T4
**Consumes (frozen):** gateway bootável por `CODM_ENV=e2e` com cenário default (T4). Os 12 specs existentes são INTOCÁVEIS — se algum quebrar com o gateway presente, é regressão a investigar (o gateway compartilhando o arquivo pode alterar timing; investigar antes de tocar qualquer asserção, reportar BLOCKED se um spec existente exigir mudança).
**Scope fence:** OUT — tudo o mais.
**Gate:** `cd packages/e2e && bun run test` → 13+ passed (12 antigos intocados + QR novo) / 2 skipped, estável em 2 rodadas.

### Step T10.1 — Config + spec + gates + commit

```bash
git add packages/e2e/
git commit -m "feat(e2e): gateway no stack com canal roteirizado — a tela de QR vira spec (T10)"
```

---

## Final Validation

- [ ] `cd packages/api/go && go test ./... && go vet ./...` — verde
- [ ] `bun tsc` — 0 erros em todos os workspaces
- [ ] `bun lint` — limpo
- [ ] `cd packages/api/typescript && bun test` — verde (1378+)
- [ ] `cd packages/app/react && bun test` — verde (259+); tempo default (sem services) registrado antes×depois
- [ ] `bun run test:tooling` — verde (manifesto/render-manifest gates)
- [ ] `cd packages/e2e && bun run test` — 13+/2-skipped estável 2 rodadas
- [ ] `grep -rn "CODM_E2E" . --exclude-dir=node_modules` → 0 fora de `.specs`/`.plans`/história git
- [ ] AC mapping:
  - AC-1 → grep de símbolos de serviço em `core/registry` + `core/pkg/testenv` = 0 (T1/T5); `channel.Overlays` colocado (T4)
  - AC-2 → grep CODM_E2E = 0 (T4); recusa não-real-sob-PRODUCTION → `registry_test.go` (T1)
  - AC-3 → `qr_pairing_test.go` falseado (T5)
  - AC-4 → `inbound_emission_test.go` falseado (T6)
  - AC-5 → `cmd/api/main_test.go` com `registry.Validate`, falseado (T4)
  - AC-6 → `cross-service.spike.test.ts` (T7) + receita no manifesto
  - AC-7 → os 3 testes migrados, cada um falseado (T9)
  - AC-8 → `go-boundary.test.ts` dois casos, ambos falseados (T8)
  - AC-9 → `12-channel-qr.spec.ts` (T10)
  - AC-10 → esta seção inteira

## Notes

- **Pré-flight do /build:** `validate-plan` reporta EXATAMENTE 4 achados conhecidos (PR-27 sobre os 4 arquivos do mock Go de T3 — scenario/channel/factory/channel_test) até o T0 executar — é o próprio defeito que T0 conserta. O orquestrador prossegue SE E SOMENTE SE o conjunto de achados for exatamente esse; T0 roda primeiro e o re-run do validate-plan após T0 deve dar exit 0 (gate do T0).
- **Nenhum verbo de `bun cli` se aplica aos artefatos Go** — o generator Go não existe (`bun cli --help`: "NOT YET implemented"); T0 torna essa exempção declarada em vez de conhecimento tribal.
- **O veredito do spike do reset (T7) é LEI para T8/T9** — não re-derivem o mecanismo.
- **Os blocos Go são forma final intencional com fiação a verificar** — em especial: como o auto-pareamento do mock alcança o mapper real (T3, com NEEDS_CONTEXT sancionado), a mecânica de porta efêmera do StartHTTPServer (T1), e a shape exata da receita `testBoot` que a gramática STAMP-MANAGED do manifesto aceitar (T7).
- **Paralelismo de dispatch**: T1∥T2∥T3 são disjuntos (core/registry × rename × mock) — mas a lição da frente anterior vale: se rodar em árvore compartilhada, serializar; T10 pode rodar após T4 em paralelo lógico com T5–T9, mesma ressalva.
