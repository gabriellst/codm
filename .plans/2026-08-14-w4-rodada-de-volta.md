# W4 — a rodada de volta, codm → template

> **Para workers agênticos:** passos com checkbox (`- [ ]`). Onda 4 de 4, e a ÚNICA que edita o
> template. Vem por último de propósito: assim carrega o que as três anteriores ensinarem, em vez de
> subir metade e ter de subir de novo.

**Goal:** Devolver ao template o que o codm faz melhor — incluindo o que esta sessão produziu.

**Architecture:** Direção única. O **codm é fonte só-leitura**; o **template é o único repo
editado**. Nenhum commit no codm nesta onda.

**Spec:** `.plans/2026-08-14-readequacao-codm-template.md` (§"Onde o codm está À FRENTE do template")

## Global Constraints

- Exit sem pipe · testemunha antes · caminho absoluto · `pwd` antes de agir · nada pushed.
- **O template estava 5/5 verde** ao fim do GOAL 1 (`bc7bda61b`). Ao contrário do codm, aqui não há
  dívida vermelha herdada: **qualquer vermelho é desta onda.**
- Rode `bun tsc --skip-nx-cache` ao menos uma vez.

---

## Task 1 — o que ESTA sessão produziu e o template não tem

- [ ] **Step 1: `projection-shape.test.ts`**

O template tem o **mesmo detector** (184 ln), reportando `0 finding(s)`, e **zero teste**. É o
mesmo defeito que o codm tinha e que a testemunha fechou.

```bash
C=/Users/work/Desktop/Projetos/pessoal/codm
T=/Users/work/Desktop/Projetos/pessoal/template-fullstack
cd $T && cp $C/scripts/detectors/projection-shape.test.ts scripts/detectors/projection-shape.test.ts
bun test scripts/detectors/projection-shape.test.ts > /tmp/p.txt 2>&1; echo "EXIT=$?"
```

O teste usa `ROOT_OVERRIDE` + `--json` sobre árvore temporária, então não depende do conteúdo do
repo — mas **confira a FORMA DE MÓDULO** antes de assumir: o `projection-shape.ts` do template
exporta o mesmo? aceita `--json`? O do codm aceita; o de lá pode ter divergido.

**Testemunha:** desligue uma regra do detector do template, prove que o teste fica RED nomeando-a,
restaure.

- [ ] **Step 2: skip RUIDOSO no `sqlc-parity.test.ts` do template**

Lá os dois casos que rodam `sqlc` usam `it.skipIf(!sqlcAvailable)` — sem o binário no PATH eles
**somem do relatório** e o gate vira no-op sem dizer. Trocar pelo `skipWithNoise()` do codm: o caso
continua existindo, aparece como passado, e grita no stderr que a verificação não aconteceu.

**Falseador:** tire `sqlc` do PATH (`PATH=/usr/bin bun test scripts/sqlc-parity.test.ts`) e mostre
o antes (silêncio) e o depois (aviso).

- [ ] **Step 3: `sqlc -f <config absoluto>` no lugar de `{ cwd }`**

Medido no codm: com `cwd`, o teste passa quando rodado da raiz e **falha dentro do hook de
pre-commit** ("error parsing configuration files: file does not exist"). Um gate que só funciona
quando invocado do lugar certo é frágil.

**Falseador:** rode o teste do template a partir de `/tmp` — antes falha, depois passa.

- [ ] **Step 4: bateria do template e commit**

---

## Task 2 — `component-quality.ts`

O codm tem 143 linhas contra 104 do template (53 linhas de diff). **Leia o diff antes de copiar**:
parte pode ser regra nova (sobe), parte pode ser adaptação ao codm (não sobe).

- [ ] Listar, regra a regra, o que existe só no codm e decidir por item.
- [ ] Cada regra que subir precisa de caso no teste do template que reprova sem ela.
- [ ] **Condição (3) GO-SHARING:** se alguma dessas regras for language-agnostic, ela entra nas
      DUAS variantes de skill (`typescript/registry.yaml` E `go/registry.yaml`) com exemplo real do
      lado Go. Sem par Go não conta entregue. Se nenhuma for, **diga isso e por quê**.

---

## Task 3 — `DataDirLock` e `enumCheck`

`DataDirLock` (139 ln): lock de PID por papel, com reclaim de PID morto, exportado como subpath
próprio. Sem contrapartida no template.

`enumCheck`: dá `CHECK (col IN (...))` no banco, single-sourced dos enums de wire. **O pg do
template não tem nenhum** — a convenção de lá é "texto, nunca `pgEnum`".

- [ ] **`DataDirLock` só sobe se o template tiver a necessidade.** Ele existe no codm porque há dois
      processos disputando um data dir. Se o template não tem sidecar, subir isso é over-engineering
      — **PARE e reporte** em vez de portar por simetria.
- [ ] **`enumCheck` no pg é decisão, não porte.** A ausência lá é deliberada. Proponha, com o custo
      (mais uma coisa que a migração precisa emitir) e o ganho (a invariante deixa de depender de
      cuidado), e deixe a decisão para o founder.

---

## Task 4 — "NO SKIP, EVER": o template viola a própria doutrina

O docblock do `testenv.go` do template carrega a lição com o custo medido:

> *"the outbox claim asked Postgres for an operator that does not exist, once per poll, for two
> months and nine days — behind a self-skip that kept `go test ./...` green the whole time."*

E o template tem **5 self-skips** de `DATABASE_URL not set` / `postgres unreachable`:
`core/db/sql/embedded_test.go:17` e
`internal/activity/projections/pg_activity_entry_projection_repository_test.go:25,30,34,46`.
O codm, em comparação, tem 2 skips condicionais e **3 recusas documentadas**.

- [ ] **Step 1: varredura (condição 2)** — inventário de TODO `t.Skip` em `*_test.go` do template,
      no plano, com grep final provando zero fora dele.

- [ ] **Step 2: para CADA um, REMOVA e MEÇA**

```bash
cd $T/packages/api/go && go test ./... ; echo "EXIT=$?"
```

- **Se o teste falha:** o skip escondia defeito. **Esse é o achado** — reporte, não conserte na
  surdina.
- **Se o teste passa:** o skip era desnecessário. Remova.
- **Se falha por falta de Postgres:** aí a pergunta é outra — o template quer o `testenv` provisionar
  (é o que ele faz: banco efêmero das migrações) ou quer aceitar a dependência? Decisão, não conserto.

**Não presuma qual dos três.** A doutrina nasceu exatamente de presumir.

- [ ] **Step 3: portar as 3 recusas documentadas do codm** como comentário-padrão, para o próximo
      que sentir vontade de pular ler por que não se pula.

- [ ] **Step 4: bateria do template + commit**

## O que esta onda deliberadamente NÃO faz

- Não sobe `split-sqlite-schema.ts`: o template gera em `internal/shared/db/` e **não tem** a
  inversão que ele conserta. Sobe no dia do segundo dialeto — e aí o desenho está pronto.
- Não sobe os handles tipados sobre o schema real: no template o libsql é test-only e não tem
  schema de produto sqlite. Sem consumidor, seria cerimônia.
- Não commita nada no codm.

---

## Encerramento da W4 — 2026-08-14

**Estado: verde.** No template, com `ulimit -n` são: **1412 testes, zero falhas**.

### A correção que a onda me obrigou a fazer sobre o próprio diagnóstico

Duas afirmações minhas sobre o template estavam **erradas**, e ficam registradas porque o erro é
instrutivo:

1. *"o checkout do template pode estar doente / a captura de `spawn` está quebrada"* — **falso**. A
   causa era `ulimit -n` ambiente em **1048576**, que quebra o `posix_spawn` na raiz daquele repo
   (`/bin/echo` → `exit=1`, stdout vazio). Com `ulimit -n 8192`, tudo funciona.
2. *"as 7 falhas em `pr/cli` são dívida real e separada"* — **falso**, mesma causa. Passam 14/14 em
   três execuções seguidas. **O template tem ZERO vermelho pré-existente.**

A lição operacional é a regra que já estava no contrato e que eu não apliquei primeiro: **antes de
teorizar sobre flakiness, MEÇA.** Um ambiente hostil imita perfeitamente um repo quebrado.

### Task 3 — `enumCheck` no pg: DECIDIDO, e a decisão é não fazer

> *"mantenha o que tem no template"* — founder, 2026-08-14

A ausência de `CHECK` nos enums do pg do template era deliberada, e continua. **Nada a fazer, e o
"nada" é a entrega** — a task pedia uma proposta com custo/benefício, e a resposta do dono do repo é
que o benefício não paga a divergência. Registrado aqui para que a próxima varredura não redescubra
a "lacuna" e a conserte por conta própria.

Note que isto **não** vale para o codm: o tronco cloud criado pela W3 Task 5 usa `text` + `CHECK`,
porque lá a alternativa mediria contra o gêmeo SQLite que já faz isso, e a paridade dos dois troncos
é gate (`trunk-parity`, TRK-03).

### Item aberto que também foi decidido — o owner como ferramenta MCP no desktop

> *"Parece correto dessa forma"* — founder, 2026-08-14

Fica **como está**: o `owner` não é exposto como ferramenta MCP no desktop, e a porta local **não**
passa a fazer proxy para a nuvem. Restaurar a exposição exigiria essa ponte, e a ponte é que era o
custo. Item **fechado**, não pendente.

### O que a W4 subiu, e o que ela recusou subir

Subiu: `projection-shape`, as duas correções do `barrel-liveness`, o `skipWithNoise()` do
`sqlc-parity`, `component-quality` (+`render`, +`hasDisplayLiteral`/`JSXExpressionContainer`), o
`testenv.Provision(t)` do Go e a eliminação dos **5 `t.Skip`** que violavam o "NO SKIP, EVER" do
próprio template.

Recusou subir, com razão nomeada: `BRAND_NAME` (é identidade de produto, não regra), o
`split-sqlite-schema.ts` (o template não tem a inversão que ele conserta) e os handles tipados (sem
consumidor lá, seria cerimônia).
