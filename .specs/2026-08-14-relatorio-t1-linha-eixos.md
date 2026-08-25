# Relatório T1′ — a linha de eixos, e o veredito do ponto de decisão

> Incremento entregue da T1 do contrato de reconciliação, com o escopo que **não** depende das
> perguntas abertas em `.specs/2026-08-14-pare-e-reporte-t1-familia-pg.md`.
> Branch `feat/eixo-ambiente-go`. Nada pushed.

## O que entrou

`packages/api/typescript/src/shared/deployment.ts` — a única declaração de eixos de infra e a
tabela de planos:

| Peça do contrato | Estado |
|---|---|
| `InfraChoices` (única declaração de eixos) | ✅ |
| `InfraModules` (derivado por mapped type) | ✅ |
| `PLANS` — `cloud` `Partial`, `local` **exaustivo** | ✅ |
| `Deployment` = `keyof typeof PLANS` | ✅ |
| `MountedContext<D>` = `keyof PLANS[D]` | ✅ |
| `Criteria` como registro aberto | ✅ |
| `planFor` **total** (lança, nunca cai em default) | ✅ |
| `CLOUD_CONTEXTS` deixa de ser declarado e passa a ser **derivado** | ✅ |
| `ContextDescriptor` + composição explícita + `cloud-profile.ts` apagado | ❌ — ver §4 |

`DatabaseFamily` tem **um** membro hoje (`'libsql'`). Isso não é simplificação de conveniência: é o
estado real do repo, e está documentado no tipo com o ponteiro para o PARE E REPORTE que explica
por que a família `pg` não entrou junto.

## 1. A segunda cópia morreu

Antes:

```ts
export const CLOUD_CONTEXTS: ReadonlySet<ContextModule> = new Set<ContextModule>(['auth', 'owner', 'shared'])
```

Depois:

```ts
export const CLOUD_CONTEXTS: ReadonlySet<ContextModule> = new Set<ContextModule>(keysOf(PLANS.cloud))
```

O conjunto montado na nuvem era a **segunda transcrição** da mesma informação que `PLANS.cloud`
carrega — duas listas que só um teste mantinha em acordo. Agora há uma fonte e uma derivação.

Isto é a decisão 10 do grill parcialmente cumprida: dos três exports de `cloud-profile.ts`, o
`CLOUD_CONTEXTS` **parou de ser uma declaração**. Os outros dois (`isCloudProfile`,
`filterRoutersForCloudProfile`) só podem morrer quando a composição explícita chegar, porque é ela
que torna *"contexto não montado"* equivalente a *"contexto não carregado"* — sem ela ainda há o
que filtrar.

## 2. FALSEADOR (a) — contexto novo quebra o `tsc` no `PLANS.local`

Rodado **antes** de qualquer afirmação. Adicionei `billing: { pgSchema: 'billing' }` a `CONTEXTS`:

```
$ bun x tsc -p tsconfig.build.json --noEmit ; echo "EXIT=$?"

src/shared/deployment.ts(66,2): error TS2741: Property 'billing' is missing in type
  '{ readonly auth: { readonly db: "libsql"; }; readonly owner: { readonly db: "libsql"; }; … }'
  but required in type 'Record<"auth" | "owner" | "shared" | "agent" | "workspace" | "thread" |
  "issue" | "artifact" | "billing" | "ui" | "external", InfraChoices>'.

EXIT=2
```

O compilador cobra a decisão **na linha do plano**, antes do commit — que é exatamente o que o
contrato pede. (Os rails de exaustividade que já existiam, `routers.ts` e `shared/registry.ts`,
reprovaram junto; são três testemunhas independentes do mesmo fato.)

Revertido; `tsc` volta a `EXIT=0`.

## 3. FALSEADOR extra — a derivação é carregada, não decorativa

Uma derivação que ninguém consome é cerimônia. Testemunha: alarguei `PLANS.cloud` com
`agent: { db: 'libsql' }` e rodei o rail que já existia:

```
$ bun test tests/architecture/cloud-profile.test.ts ; echo "EXIT=$?"

error: expect(received).toEqual(expected)
  [
+   "agent",
    "auth",
✗ cloud-profile (CODM_PROFILE=cloud mounts only auth+owner+shared)
   > CLOUD-01: CLOUD_CONTEXTS is EXACTLY {auth, owner, shared} — the AC-1 falsifier

EXIT=1
```

O rail que antes vigiava uma transcrição agora vigia a **derivação**: mexer na tabela move o Set.
Revertido; `EXIT=0`, 6 pass.

## 4. PONTO DE DECISÃO (3) — a forma sobreviveu ao contato?

**Parcialmente. O desenho dos eixos sobreviveu; o do sequenciamento não, e há um defeito real na
interação de três decisões fechadas.**

### 4.1 O que sobreviveu, sem emenda

`InfraChoices` como única declaração, `InfraModules` derivado, `PLANS` com `local` exaustivo,
`Criteria` como registro aberto e `planFor` total: tudo isso caiu no repo sem um `if`, sem cast,
sem camada nova, e o falseador (a) prova que a exaustividade morde. O `as const satisfies`
funciona como anunciado — `PLANS.cloud.owner.db` é `'libsql'` literal, não `DatabaseFamily`.

### 4.2 O DEFEITO — as decisões 8, 11 e 12 são mutuamente inconsistentes, e o codm prova

- **Decisão 8**: `local: Record<ContextModule, InfraChoices>`, **exaustivo, sem `Partial`**. Como
  `InfraChoices = { db: DatabaseFamily }` tem `db` **obrigatório**, todo contexto recebe um `db`.
- **Decisão 11**: `INFRA` existe **"nos três duais"** — só nos contextos com bindings por família.
- **Decisão 12**: amarra bidirecional — *"escolha no plano sem eixo no contexto **lança**"*.

Medido no repo: **9 dos 10 contextos têm bindings `Drizzle*`** (dependentes de família). O décimo,
**`external`, tem zero** — seu registry é literalmente `expandBindings([])`.

Então, no boot: o plano escolhe `db` para `external` (forçado pela decisão 8), `external` não
declara o eixo (correto, pela decisão 11), e a amarra da decisão 12 **lança**. As três decisões,
aplicadas juntas, tornam o boot impossível para um contexto sem família.

Não é hipótese: é o único contexto do codm que não toca banco, e ele existe.

**As saídas, e por que nenhuma é boa sozinha:**

| Saída | Custo |
|---|---|
| `external` declara `INFRA = { db: { libsql: expandBindings([]) } }` | Não exige `if` nem cast, mas **mente**: diz "participo do eixo `db`" um contexto que não tem banco |
| `InfraChoices` com eixos opcionais no plano | Quebra a decisão 8 (`sem Partial, de propósito`) e devolve a exaustividade que é o ponto |
| Amarra só numa direção | Quebra a decisão 12 e reabre o silêncio que ela fecha |

**A saída que o desenho pede, e que eu NÃO tomei por ser mudança de contrato:** o plano deveria
mapear contexto → `Partial<InfraChoices>` **exaustivo nas CHAVES** (todo contexto presente, sem
`Partial` no `Record`) mas permitindo `{}` como escolha — "este contexto monta e não escolhe eixo
nenhum". Isso preserva as três intenções ao mesmo tempo: contexto novo continua quebrando o `tsc`
(a chave é obrigatória), contexto sem família continua exprimível (`{}`), e a amarra bidirecional
continua total.

Registrado como pergunta, não aplicado. `PLANS.local` hoje dá `{ db: 'libsql' }` a `external`
também — o que é inofensivo enquanto a amarra de boot não existe, e é precisamente por isso que a
amarra não entrou neste incremento.

### 4.3 O sequenciamento não sobreviveu

Já documentado em `.specs/2026-08-14-pare-e-reporte-t1-familia-pg.md` §3b: a composição não é
fatiável por contexto (`routers.ts` é `satisfies Record<ContextModule, Router>`, exaustivo, e
importá-lo executa os 10 `BoundedContext.create`). "T1 vertical em `owner`" não existe como estado
coerente. O corte que funciona é por camada — e este incremento é a primeira camada.

## 5. O que foi deliberadamente NÃO feito

- **`ContextDescriptor`, MANIFEST, composição explícita e o apagamento de `cloud-profile.ts`.**
  São atômicos sobre os 10 contextos (§4.3) e sobre a amarra bidirecional cujo desenho tem o
  defeito do §4.2. Entregar metade deixaria o repo com duas composições concorrentes — pior que
  não começar.
- **A amarra bidirecional de boot (falseador (b)).** Depende da resposta do §4.2. Escrevê-la hoje
  significaria escolher uma das três saídas ruins por conta própria.
- **A família `pg` e o falseador (c).** Bloqueados pelas perguntas de propriedade de dado do
  PARE E REPORTE.
- **Mover `CODM_PROFILE` do kernel `Config` para o `ProductConfig`.** É viável (o kernel lê
  `process.env` cru e nunca importa `ProductConfig`), mas muda o default de `''` para `'local'` e
  exige virar `schema: 'raw'` → `'product'` em `template.config.ts`, passando pelo rail ENV-02.
  Não é trabalho isolado: só faz sentido junto da composição que consome o valor tipado.
- **`isCloudProfile` / `filterRoutersForCloudProfile`.** Continuam vivos e corretos; morrem com a
  composição, não antes.

## 6. Bateria — exit code sem pipe

Comandos rodados da raiz do codm, cada um `cmd > arquivo 2>&1; echo "EXIT=$?"` — sem pipe entre
comando e captura.

| Comando | EXIT | Nota |
|---|---|---|
| `bun tsc` | **0** | |
| `bun lint` | **0** | |
| `bun run test` | **1** | **PRÉ-EXISTENTE** — ver abaixo |
| `bun detect` | **1** | **PRÉ-EXISTENTE** — ver abaixo |
| `bun test:tooling` | **0** | |
| `bun check:generated` | **0** | |
| `bun sync:check` | **0** | |

### As duas vermelhas são pré-existentes, e isso foi MEDIDO, não presumido

Removi o `deployment.ts` e reverti o `cloud-profile.ts` para o HEAD, e rodei os dois de novo:

```
BASELINE detect EXIT=1
BASELINE test   EXIT=1
```

**`detect`** — o diff entre a saída baseline e a minha tem **uma única linha**, e é a contagem de
arquivos varridos:

```
< 4 finding(s) (4 error, 0 warning), 0 suppressed, 1076 file(s) scanned
---
> 4 finding(s) (4 error, 0 warning), 0 suppressed, 1077 file(s) scanned
```

`1076 → 1077` é o `deployment.ts` entrando na varredura. Os achados são **idênticos**: os mesmos
9 (4 error) do `registry-scan`, os mesmos 4 do `import-direction`, os mesmos 35 do `slice-closure`,
o mesmo 1 do `go-enum-literals`. **O arquivo novo introduziu ZERO achados.**

Os 4 erros gating do `import-direction` são todos `R5` em arquivos `*.services.test.tsx` — a lane
que a frente paralela `feat/design-d3-adequacao` criou (ver `58a1af0d`, "SB-04 aprende a lane
.services.test.tsx que a própria frente criou").

**`test`** — as mesmas 3 falhas no baseline e com a mudança, todas de frontend e todas na área que
a mesma frente paralela está reescrevendo:

```
✗ composeStories + msw sob bun — spike > uma story conectada real monta, mas os dados mockados via msw NÃO chegam (medido)
✗ OnboardingFlow — stories > StepWalking
✗ OnboardingFlow — contra o backend real > concluir > REGRESSÃO 09/08 …
```

Nenhuma delas toca `shared/deployment.ts` nem `shared/cloud-profile.ts`. Ficam registradas como
débito herdado desta branch, **não** como consequência deste incremento — e não foram consertadas
porque pertencem a um programa em voo de outra frente.

Não rodados neste incremento: `bun e2e` e `go build/test`. O diff é um módulo TS puro (tipos + uma
tabela literal + duas funções sem efeito) mais a troca de uma declaração por uma derivação já
coberta por rail próprio; nenhum toca Go, wire, migração ou rota. Fica dito explicitamente em vez
de implícito.
