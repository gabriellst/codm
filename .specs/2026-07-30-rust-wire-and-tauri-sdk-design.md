# SPEC — Gerador wire para Rust + consumo de contracts/SDK no shell Tauri

Status: **DRAFT** (análise + design; não ratificado)
Data: 2026-07-30
Escopo: `packages/contracts/codegen` (emissor Rust), `packages/client` (gerador Rust),
`packages/app/tauri` (consumidor), rails de teste.

Baseline analisado: `codedm` @ HEAD e `template-fullstack` @ HEAD (branch `feat/clean-polyglot`).

---

## 0. Sumário executivo

O gerador wire **já tem um emissor Rust** — mas ele vive no `template-fullstack`, não no
`codedm`, e o que ele emite **não fecha com o fio**. Três defeitos foram provados
empiricamente (§2), não inferidos. Simultaneamente, o `codedm` tem o parser **muito** mais
avançado (uniões, arrays, uuid, string-enums, union-slots ratificados) mas **nenhum**
emissor Rust. A capacidade está partida entre os dois repos, em metades complementares:

| | parser (shapes) | emissor Rust (wire) | cliente HTTP Rust | app Tauri |
|---|---|---|---|---|
| `template-fullstack` | pobre (9 kinds) | ✅ existe (compila, **errado**) | ✅ progenitor, 3.6k linhas, compila | ❌ |
| `codedm` | rico (13 kinds + uniões + slots) | ❌ inexistente | ❌ inexistente | ✅ existe (shell, sem HTTP) |

O trabalho não é "escrever um emissor Rust do zero". É **(a)** portar o emissor do template
para o parser rico do codedm, **(b)** corrigir os três defeitos de fio, **(c)** definir a
materialização de união em Rust (hoje indefinida em qualquer superfície Rust), **(d)** portar
o gerador de cliente Rust (progenitor), **(e)** resolver a duplicação de tipos entre
`contracts-rust` e `client-rust`, e **(f)** ligar os dois no shell Tauri.

---

## 1. Estado atual — o que existe, medido

### 1.1 Pipeline de contracts (comum aos dois repos)

```
wire/*.tsp  ──tsp compile──►  dist/contracts.openapi.yaml  ──►  parse-openapi.ts
                                                                      │
                                                   ┌──────────────────┼──────────────────┐
                                              emit-wire-ts        emit-wire-go       emit-wire-rs
                                            generated/typescript  generated/go     generated/rust
```

O parser é o **único** ponto de entendimento de shape; os três emissores consomem o mesmo
`ParsedContracts`. Isso é a coisa certa e é o que torna o port viável: adicionar Rust é
adicionar um emissor, não um pipeline.

### 1.2 Superfície de contrato do codedm

- 38 arquivos de evento (`wire/events/*.tsp`), 36 enums (`wire/enums/*.tsp`).
- 2 eventos com `@unionSlot` (`channel-message-received`, `channel-special-platform-event-received`).
- ≥3 eventos com campos array (`thread-attached`, `channel-message-seen`, `channel-message-delivered`).
- Decorators TypeSpec próprios em `wire/lib/union-slots.{tsp,js}` → extensões
  `x-union-slots` / `x-union-variants` no OpenAPI.

### 1.3 O que o parser do codedm cobre (13 kinds)

`string`, `uuid`, `literal`, `string-enum`, `enum-ref`, `union-ref`, `boolean`,
`integer{int32,int64}`, `number{float,float32,float64}`, `date-time`, `url`, `array{items}`,
`unknown`.

Além disso: `ownFields` (vs. campos herdados do envelope), `unionSlots` associados e
validados, desembrulho de `$ref` dentro de `allOf` de 1 elemento (o jeito que TypeSpec
emite um `$ref` anotado com `@doc`), e um segundo passe que reclassifica `enum-ref`→`union-ref`.

O parser do `template-fullstack` cobre 9 kinds e **nada** disso.

### 1.4 O que o emissor Rust do template faz hoje

`emit-wire-rs.ts` (144 linhas) emite três arquivos:

- `enums.rs` — `pub enum` com derives `serde` + `strum` + `utoipa`. **Isso está certo.**
- `events.rs` — invocações do macro `integration_event!("nome" => XEvent { campo: z.string(), ... })`,
  ou seja, **o DSL Zod-like do framework de servidor**, resolvido pelo proc-macro em
  `packages/api/rust/core/macros`.
- `envelope.rs` — um `enum IntegrationEvent` `#[serde(tag = "name")]` com uma variante por
  evento, cada uma `{ payload: XPayload, owner_id: String }`.

Compila (`cargo build -p template-contracts-rust` → OK, 9 warnings de doc comment perdido).

### 1.5 Cliente HTTP Rust (só no template)

`packages/client/generators/rust/` roda **progenitor** via um binário Rust auxiliar, um
módulo por serviço, e renderiza um `lib.rs` agregado com `Client` + `ClientBuilder`
(`.typescript(url).rust(url).go(url).build()`). 3.626 linhas geradas; compila;
tem teste de construção do builder. Passa por `preprocessSpec` (COMPLIANCE.md: OpenAPI 3.0,
sem `$ref` externo, só `application/json`, dropa ops SSE, rejeita formas nullable 3.1).

**É um protótipo funcional** — a base do "chamadas HTTP no Tauri usando a SDK".

### 1.6 O shell Tauri (só no codedm)

455 linhas de Rust: `lib.rs` (64), `sidecars/mod.rs` (221, spawna daemon TS + gateway Go),
`commands/secrets.rs` (46, keyring), `commands/mod.rs` (48). **Zero HTTP, zero contracts,
zero SDK.** Já declarado no manifesto como `lang: 'rust'`, `kind: 'shell'`.

Nota: o `Cargo.toml` do shell abre com `# UNVERIFIED-COMPILE: no Rust toolchain is present`.
Isso está **obsoleto** — a máquina tem `cargo 1.97.1`.

---

## 2. Os três defeitos de fio — provados, não inferidos

Rodei um harness de round-trip contra o crate gerado (`cargo test -p template-contracts-rust`).
Ambos os testes falharam, com estas mensagens:

### 2.1 O envelope Rust não aceita o envelope declarado no contrato

```
FLAT-FAIL: missing field `payload`
```

O contrato TypeSpec declara o evento **FLAT**: `IntegrationEvent` carrega
`name`/`entityId`/`ownerId`/`occurredAt`, e cada evento `extends IntegrationEvent`
acrescentando os campos de payload **no mesmo nível** (no OpenAPI: `allOf: [$ref
IntegrationEvent]` + `properties` na raiz). O JSON correspondente é:

```json
{ "name": "...", "entityId": "...", "ownerId": "...", "occurredAt": "...",
  "videoId": "...", "byteSize": 1024 }
```

O `enum IntegrationEvent` gerado em Rust exige `{ name, payload: {...}, ownerId }` — aninhado.
Não parseia o de cima.

**Mas a conclusão não é "o Rust está errado".** É pior: **há três formas em circulação e a
declarada não é usada por ninguém.**

| superfície | forma | `entityId` | `occurredAt` |
|---|---|---|---|
| contrato TypeSpec/OpenAPI | FLAT | ✅ declarado | ✅ declarado |
| binding Go (template) | FLAT | ✅ | ✅ |
| binding TS (runtime) | ANINHADA `{name,payload,ownerId}` | ❌ some | ❌ some |
| binding Rust (template) | ANINHADA `{name,payload,ownerId}` | ❌ some | ❌ some |
| **transporte real (Go `types.IntegrationEvent[T]`)** | ANINHADA `{id,ownerId,time,name,payload}` | `id` | `time` |

Ou seja: o envelope **declarado** no `.tsp` (`entityId`, `occurredAt`) **não existe em
nenhum transporte**. O que trafega é `{id, ownerId, time, name, payload}`
(`packages/api/go/core/types/events.go:90`). Os emissores usam `ENVELOPE_FIELDS = {name,
entityId, ownerId, occurredAt}` apenas para **subtrair** esses nomes e derivar o payload;
cada linguagem então re-adiciona o envelope que quiser.

**Isto é a raiz de "não temos todos os casos".** O envelope é um contrato não-especificado.
Antes de emitir Rust é preciso decidir e escrever qual é o envelope canônico — porque o Rust
é o primeiro consumidor que vai **desserializar** o que Go e TS **serializam**, sem um
humano no meio para reconciliar.

O codedm já caminhou para a resposta certa (spec union-slots §2.2: "o nested `{id, ownerId,
time, name, payload}` wire shape the gateway publishes") e o emissor Go do codedm já emite,
**além** do struct flat, um `XPayload` por evento exatamente para plugar em
`types.IntegrationEvent[Payload]`. A recomendação (§3.1) é fechar isso.

### 2.2 Escalares: `float` vira `String`

```
FLOAT-FAIL: invalid type: floating point `0.85`, expected a string at line 4 column 31
```

`emit-wire-rs.ts:36` mapeia `number` → `z.string()` com o comentário
`// DSL has no float head; map to string for now`. O DSL do macro (`dsl.rs`) de fato só tem
`string | int | uint | boolean | date | enum | instance | array | literal` — **não há head de
float**. Então `completionRatio: float32` (ViewRecorded) é emitido como `z.string()` →
`String` em Rust, e o JSON `0.85` não desserializa.

O gap é **no DSL**, não só no emissor. Consequências em cadeia:

- `number/float32/float64` → sem representação.
- `uuid` → o parser do codedm distingue, o DSL não tem head; cairia em `string`
  (aceitável, mas perde o tipo `uuid::Uuid` que o Go já usa).
- `array` → o DSL **tem** `z.array(...)`, mas o emissor Rust do template **nunca** o emite
  (o parser dele não tem o kind `array`).
- `string-enum` (enum inline, sem `$ref`) → sem head; hoje viraria `unknown`→`string`.
- `union-ref` → sem head.
- objeto aninhado → **nem o parser** cobre: `typeOf` devolve `enum-ref` para *qualquer*
  `$ref`, então um `$ref` para um model (não-enum, não-união) é emitido como se fosse enum.
  Latente hoje porque o contrato não tem modelos aninhados; quebra no dia que tiver.

### 2.3 Uniões: indefinidas em Rust

O `discriminated_union!` existe (`macros/src/discriminated_union.rs`, 151 linhas) e emite
o shape correto (`#[serde(tag)]` + `rename_all = "camelCase"` por variante). Mas:

- **Não é ligado ao codegen.** O `emitRsEnvelope` escreve um enum serde à mão em vez de
  invocá-lo, e nada no emissor Rust lê `unionSlots` ou `ParsedUnion` (o parser do template
  nem os tem).
- O `impl Schema` dele é **parse identidade**, com o gap documentado no próprio arquivo:
  "DSL-level refinements (`.min/.max/.refine` on variant fields) are NOT applied here".
- A semântica de union-slot do codedm (slot opaco no contrato, formas no dono, materialização
  no codegen, primário = slot com mais variantes, secundários estreitados pela interseção
  dos discriminadores) **não tem contraparte Rust nenhuma** — nem a materialização "wire/JSON"
  nem a "in-process" descritas na emenda §2.4.1.
- O cliente progenitor gerado não tem **nenhum** `#[serde(tag/untagged)]` — porque os specs
  atuais não têm `oneOf`. Não há evidência de que progenitor produza o narrowing desejado
  quando houver; **isso precisa ser medido antes de depender dele** (§3.3).

### 2.4 Defeitos menores, mas reais

- **Doc comments perdidos**: `emitRsEvents` emite `/// doc` antes de uma invocação de macro →
  9 warnings `unused doc comment`; a doc do contrato não chega ao Rust.
- **`entityId`/`occurredAt` sumidos** do envelope Rust (§2.1) — informação de contrato
  simplesmente ausente do binding.
- **Testes do codegen já vermelhos**: `bun test codegen/` no template dá **8 pass / 3 fail**.
  Os testes descrevem uma intenção *diferente* da implementação — `emit-wire-rs.test.ts:37`
  espera `video_id: String,` (Rust puro) e `use crate::integration_event;`, e o emissor produz
  `video_id: z.string(),` e `use template_core_rust::integration_event;`. Dois dos três
  failures são do emissor Rust. Ou seja: **a suíte já registra que o alvo era Rust puro, não
  o DSL** — e alguém trocou a implementação sem atualizar o teste (ou vice-versa).
- **Enums duplicados** entre `contracts-rust` e `client-rust`: `ReactionType` e `VideoStatus`
  existem nos dois (`client/dist/rust/src/rust/mod.rs:529,927`). Um consumidor (o Tauri) que
  importe os dois vê dois tipos incompatíveis com o mesmo nome.
- **Peso da dependência**: emitir o DSL faz `contracts-rust` depender de
  `template-core-rust` (o framework de *servidor*: axum, sqlx, utoipa, o proc-macro inteiro).
  Para um shell desktop que só quer desserializar JSON, isso é uma árvore de dependências
  desproporcional — e acopla o app a mudanças no framework de backend.

---

## 3. Design proposto

### 3.1 Decisão-zero: fixar o envelope canônico (bloqueia todo o resto)

Nada de Rust deve ser escrito antes disto, porque o Rust é o lado que desserializa.

**Proposta**: o envelope canônico de transporte é o que o Go já publica —
`{ id, ownerId, time, name, payload }` — e o contrato passa a **declará-lo de verdade**
em vez de declarar um envelope-fantasma. Duas formas de fechar:

- **(A) contrato segue a realidade** — `_base.tsp` renomeia `entityId`→`id`,
  `occurredAt`→`time`, e o payload passa a ser um model próprio referenciado por `payload`.
  Os emissores param de "subtrair `ENVELOPE_FIELDS`" e passam a ler a estrutura declarada.
  Mais honesto, mas mexe em 38 eventos + os dois emissores existentes + o Go verbatim.
- **(B) o achatamento é declarado como convenção de codegen** — mantém o `.tsp` flat, mas
  a regra "envelope = {id,ownerId,time,name}, resto = payload" vira **um artefato único**
  (`codegen/lib/envelope.ts`) que os três emissores consomem, com um rail que prova que os
  três produzem o mesmo split, e o `ENVELOPE_FIELDS` duplicado nos emissores morre.

Recomendo **(B)** para esta rodada: entrega o Rust correto sem um refactor de 38 eventos, e
deixa (A) como follow-up de higiene. O que **não** é aceitável é seguir com três emissores
cada um com sua cópia do set de nomes e seu próprio envelope.

Em qualquer das duas, `entityId`/`occurredAt` (ou `id`/`time`) **entram** no binding Rust —
hoje somem.

### 3.2 Emissor Rust: Rust puro, não o DSL

O emissor Rust de contracts deve emitir **structs serde puros**, não invocações do
`integration_event!`. Razões, em ordem de peso:

1. **O consumidor é um cliente.** O Tauri não instancia entidades nem valida invariantes de
   domínio; ele desserializa JSON e faz HTTP. O DSL existe para o *servidor* (validação,
   `Schema`/`DomainType`, utoipa).
2. **Corta a dependência** em `template-core-rust` — `contracts-rust` fica com
   `serde` + `serde_json` + `chrono` + `uuid` (+ `strum` para os enums). Compila em segundos,
   e o shell desktop não arrasta axum/sqlx.
3. **Destrava os shapes que o DSL não tem** (float, uuid, string-enum, união) sem precisar
   estender o proc-macro primeiro.
4. **É o que a suíte já pede** (§2.4): `emit-wire-rs.test.ts` espera `video_id: String`.

O backend Rust (`packages/api/rust`), se e quando precisar dos eventos como cidadãos de
domínio, envolve o struct gerado — não o contrário. Isso mantém a direção de dependência
correta (contracts não conhece framework).

Mapa de tipos alvo:

| FieldType | Rust |
|---|---|
| `string`, `url` | `String` |
| `uuid` | `uuid::Uuid` |
| `literal` | omitido do payload (é o tag do envelope) |
| `string-enum` | enum local gerado por evento+campo, `#[serde(rename_all)]` conforme valores |
| `enum-ref` | o enum de `enums.rs` |
| `union-ref` | o enum de `unions.rs` (§3.3) |
| `boolean` | `bool` |
| `integer{int32}` / `{int64}` / — | `i32` / `i64` / `i64` |
| `number{float32}` / `{float64,float}` / — | `f32` / `f64` / `f64` |
| `date-time` | `chrono::DateTime<chrono::Utc>` |
| `array{items}` | `Vec<T>` (nunca `Option<Vec<T>>` para opcional — `#[serde(default)]`) |
| `unknown` | `serde_json::Value` |
| opcional | `Option<T>` + `#[serde(skip_serializing_if = "Option::is_none")]` |

Convenções: `#[serde(rename_all = "camelCase")]` no struct (o fio é camelCase, o Rust é
snake_case), doc do contrato como `///` **no struct** (não antes de macro → sem warning),
`#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]`.

### 3.3 Uniões em Rust — o buraco de verdade

Aqui não há port possível: **nenhuma superfície Rust tem união hoje**. Precisa de design, e
ele tem de espelhar o que o spec union-slots já ratificou, porque o objetivo é que Go, TS e
Rust concordem *por construção*.

Duas famílias, que **não** se confundem:

**(a) `union-ref` — união fechada declarada no contrato** (`oneOf`/`anyOf` de `$ref`s no
OpenAPI; `ParsedUnion` no parser). Direto: um `enum` serde por união em `unions.rs`. Se as
variantes compartilham discriminador, `#[serde(tag = "...")]`; se não, `#[serde(untagged)]`
com o custo conhecido (mensagens de erro ruins, ordem importa) — e a preferência é **sempre**
tagged, o que significa que o contrato deve declarar o discriminador.

**(b) union-slots — união aberta, forma no dono** (`@unionSlot`/`@variant`). É o caso rico e
o que o usuário aponta como mal definido. O spec (§2.4.1) já fixa para TS **duas**
materializações não-intercambiáveis:

| superfície | payload | datas | consumidor |
|---|---|---|---|
| wire/JSON | agregado kubb do dono | strings ISO | SSE, browser, SDK |
| in-process | campos do contrato, slots+discriminadores trocados por variante | `Date` | `EventHandler` |

Para Rust, a pergunta de design é **quantas materializações o Rust precisa**, e a resposta
honesta depende do papel do Rust:

- Se o Tauri é **só cliente HTTP/SSE** (é o caso hoje): **uma** — a wire/JSON. `chrono` já
  desserializa ISO direto, então a distinção "strings ISO vs `Date`" que força duas
  materializações em TS **não existe** em Rust: `DateTime<Utc>` é o mesmo tipo nas duas
  pontas. Isso é uma simplificação real, não um atalho.
- Se um dia houver um gateway Rust com `EventHandler` in-process, ele reusa o mesmo tipo.

Materialização proposta, espelhando `schema.go` literalmente (a regra que o spec manda
reproduzir "em vez de melhorar"): primário = slot com **mais** variantes (empate → primeiro
declarado); secundários estreitados por igualdade na **interseção** das chaves
discriminadoras; zero correspondências ⇒ união completa do secundário.

Em Rust isso vira, por evento com slots:

```rust
// primário: enum tagged pelos discriminadores compartilhados
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "messageType")]           // quando 1 discriminador
pub enum ChannelMessageReceivedContent {
    #[serde(rename = "TEXT")]  Text(WhatsAppTextContent),
    // ...
    #[serde(other)]            Unknown,   // ← forward-compat, §2.5 do spec
}
```

**A regra de forward-compat do spec (§2.5) é obrigatória e não-óbvia em Rust**: um
discriminador desconhecido **não pode** falhar a desserialização. Em serde isso exige
`#[serde(other)]` numa variante unit, ou um wrapper
`enum Slot<T> { Known(T), Opaque(serde_json::Value) }`. Sem isso, uma variante nova
publicada pelo Go **derruba** o parse no Tauri inteiro — exatamente o oposto do que o spec
manda. Essa é a diferença mais importante entre "ter uniões em Rust" e "ter uniões em Rust
que não quebram".

Como o contrato **proíbe** modelar as formas das variantes (spec §6), e as formas moram no
dono (Go), o Rust conhece as variantes só por **nome**. Duas saídas:

- **(i)** o slot Rust é `serde_json::Value` + um enum de discriminador tipado. Estreitamento
  por `match` no discriminador, leitura do slot por `serde_json::from_value::<T>()` onde `T`
  vem do **cliente progenitor do dono** (que materializa o `oneOf` do openapi do gateway).
  Zero redeclaração, respeita a cadeia canônica do spec §2.4.
- **(ii)** o codegen Rust gera os structs das variantes a partir do openapi do dono
  (como o kubb faz para TS). Mais tipado, mas cria uma segunda fonte para as formas.

Recomendo **(i)**: é o que preserva "um shape, N superfícies, zero redeclaração", e usa a
SDK gerada como a única portadora das formas — que é literalmente o que o usuário pediu
("fazer chamadas http no tauri usando a sdk e os contracts").

**Item a medir antes de decidir**: o que progenitor faz com `oneOf` + `discriminator`.
Não há evidência no repo (zero `serde(tag` no cliente gerado, porque zero `oneOf` nos specs
atuais). Se progenitor não produzir enum tagged, (i) precisa de um pós-processamento — e
isso muda o custo. **Este é o único ponto do design que não pode ser fechado por leitura;
precisa de um spike.**

### 3.4 Cliente HTTP Rust no codedm

Portar `packages/client/generators/rust/` do template para o codedm, mais:

- Registrar `rust` em `REPO.lang` / `sdkPackagePrefixes` (hoje só `typescript` e `go`) —
  exigido pelo non-negotiable #5 (linguagem é first-class, nunca inferida).
- **Resolver a duplicação de enums** (§2.4). O `contracts-rust` é a fonte dos enums de
  contrato; o cliente progenitor gera os seus. Opções: pós-processar o cliente para
  re-exportar de `contracts-rust`; ou aceitar a duplicação e proibir por rail que o Tauri
  importe enum de contrato do cliente. A primeira é a correta (uma fonte), a segunda é a
  barata. Decisão do founder.

### 3.5 Wiring no Tauri

```
packages/app/tauri/src-tauri/Cargo.toml
  + codedm-contracts-rust = { path = "../../../contracts/generated/rust" }
  + codedm-client-rust    = { path = "../../../client/dist/rust" }
  + reqwest, tokio (já vêm via client)
```

- Um `src-tauri/src/api/mod.rs` que constrói o `Client` uma vez
  (`Client::builder().typescript(url).go(url).build()`) e o guarda no `tauri::State`.
  As URLs vêm de onde `sidecars/mod.rs` já as define (`API_GO_URL`,
  `http://localhost:3032`) — sem literal novo.
- Identidade: o hop S2S carrega o dono (`X-Owner-Id`), como manda o CLAUDE.md do codedm.
  O shell **não infere** dono.
- Os `#[tauri::command]` que precisarem de dado do backend chamam o cliente tipado,
  nunca `reqwest` cru — mesma regra que o frontend tem ("nunca `fetch` direto").
- Remover o comentário `UNVERIFIED-COMPILE` do `Cargo.toml` (obsoleto: `cargo 1.97.1` presente).

Nota de escopo: hoje o console React dentro do Tauri já fala com os backends pela SDK TS.
O caminho Rust é para o que **o shell** precisa (secrets, sidecar health, trabalho de
background fora do webview) — não para substituir a SDK TS do console. Vale confirmar esse
recorte antes de construir, porque ele muda quanto da SDK precisa existir em Rust.

---

## 4. Testes extensivos — o que falta e onde

O pedido de "testes extensivos" cai em quatro camadas. Hoje existe **quase nada** nas duas
primeiras (e o que existe está vermelho).

### 4.1 Unit do emissor (`codegen/emit-wire-rs.test.ts`) — padrão dos testes go/ts

Um caso por `FieldType` (13) × obrigatório/opcional (26 asserções de tipo), mais:
`array` de escalar / de enum-ref / de união; `string-enum` inline; `uuid`;
`float32` vs `float64` vs `int32` vs `int64`; `unknown`; doc comment presente/ausente;
campo que colide com keyword Rust (`type`, `match`, `enum` → precisa `r#`);
campo `camelCase`→`snake_case` com sigla (`videoId`→`video_id`, `hlsUrl`→`hls_url`).

Fixar também os **negativos**: os 3 testes vermelhos de hoje viram verdes ou são reescritos
com a intenção correta — não ficam vermelhos.

### 4.2 Round-trip de compilação + serde (o que pegou os defeitos do §2)

Este é o rail que faltava e o de maior retorno. Um teste que, a partir do
`dist/contracts.openapi.yaml`, gera, **compila** (`cargo test` com cwd em
`packages/contracts/generated/rust` — crate standalone, F6) e
faz round-trip de um JSON fixture por evento:

- `serde_json::from_str::<T>(fixture)` → `to_string` → `from_str` → igualdade.
- Fixture **compartilhada com Go e TS** — é isso que transforma "cada linguagem parseia o
  seu" em "as três parseiam a mesma coisa". Sem fixture comum, a divergência do §2.1 volta.
- Forward-compat: fixture com discriminador desconhecido **deve** parsear (§3.3), e um teste
  que prova que ela não parseava antes.
- Campo opcional ausente vs `null` vs presente.

### 4.3 Rail de paridade cross-language (`tests/architecture/`)

Estende o `union-parity` existente (3 checks) para incluir Rust:
- todo `@variant` resolve no dono (o resolver Rust entra no `detectLang` plugável que o
  spec §3 já previu);
- o split envelope/payload é **idêntico** nos três emissores (o rail que a decisão §3.1(B) exige);
- nenhum tipo de contrato é redeclarado no Tauri.

### 4.4 Fumaça HTTP no Tauri

Um teste que sobe os sidecars, constrói o `Client`, chama um endpoint real e desserializa
com o tipo de `contracts-rust`. É o único que prova a ponta-a-ponta que o usuário pediu.

---

## 5. Ordem de implementação

1. **Spike progenitor + `oneOf`** (§3.3, último parágrafo). Barato, e o resultado muda o
   design das uniões. Fazer primeiro.
2. **Decisão de envelope** (§3.1). Bloqueia tudo. Extrair `codegen/lib/envelope.ts` + rail.
3. **Portar o parser rico** — na prática o codedm já o tem; o que falta é o template
   convergir, ou (melhor) o trabalho Rust nascer **no codedm** e o template receber o backport.
4. **Emissor Rust puro** (§3.2) + unit tests (§4.1) — TDD, os 13 kinds.
5. **Round-trip compile+serde** (§4.2) com fixtures compartilhadas.
6. **Uniões** (§3.3): `union-ref` primeiro (fechado, fácil), union-slots depois
   (com `#[serde(other)]` desde o primeiro commit).
7. **Portar gerador de cliente Rust** (§3.4) + resolver duplicação de enums.
8. **Wiring Tauri** (§3.5) + fumaça (§4.4).
9. Rail de paridade (§4.3) + doc em `docs/BACKEND.md` (seção "Union slots" ganha Rust).

Passos 1–2 são pré-requisito de todo o resto. 4–5 são o núcleo. 6 é o que o usuário chama de
"não está bem definida" e é onde mora o risco.

---

## 6. Decisões que precisam do founder

1. **Envelope**: (A) contrato segue a realidade, ou (B) achatamento como convenção única de
   codegen + rail? (recomendo B agora, A como higiene)
2. **Rust puro vs DSL** no `contracts-rust`? (recomendo puro — §3.2)
3. **Union-slots em Rust**: slot `serde_json::Value` + formas via SDK do dono (i), ou gerar
   structs de variante do openapi do dono (ii)? (recomendo i)
4. **Enums duplicados** cliente↔contracts: re-exportar (uma fonte) ou proibir por rail?
5. **Recorte do Tauri**: o caminho Rust é só para o que o shell precisa, ou a intenção é
   paridade com a SDK TS do console? Muda muito o escopo.

---

## 7. Plano de correção — proposta por problemática + DX final

> Emenda 2026-07-30 (mesma sessão): transforma o diagnóstico dos §§2–3 em correções
> concretas, cada uma com o artefato que a carrega, e fecha com a DX alvo. Onde §6 pedia
> decisão do founder, aqui vai a **recomendação operacional** — ratificar ou vetar por item.

### F1 — Envelope: um artefato, três consumidores (corrige §2.1)

Criar `packages/contracts/codegen/lib/envelope.ts` — **o único lugar** que sabe o que é
envelope:

```ts
/** O envelope canônico de TRANSPORTE — o que o Go publica e todos desserializam. */
export const TRANSPORT_ENVELOPE = [
  { wire: 'id',      tsp: null,         type: 'uuid' },
  { wire: 'ownerId', tsp: 'ownerId',    type: 'string' },
  { wire: 'time',    tsp: 'occurredAt', type: 'date-time' },
  { wire: 'name',    tsp: 'name',       type: 'literal' },
] as const
/** Nomes declarados no .tsp que NÃO são payload (derivado da tabela acima + entityId legado). */
export const ENVELOPE_TSP_FIELDS: ReadonlySet<string>
/** Split único: (ParsedEvent) => { envelope, payload } — os 3 emissores chamam isto. */
export function splitEnvelope(ev: ParsedEvent): { payloadFields: EventField[] }
```

- Os três emissores **deletam** suas cópias de `ENVELOPE_FIELDS` e importam `splitEnvelope`.
- Rail novo `tests/architecture/wire-envelope-parity.test.ts`: para cada evento, o set de
  campos de payload emitido por ts/go/rs é **idêntico** (compara os artefatos gerados, não
  as implementações).
- O Rust emite o transporte real:

```rust
/// Envelope genérico — espelho de types.IntegrationEvent[T] do Go.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Envelope<T> {
    pub id: uuid::Uuid,
    pub owner_id: String,
    pub time: chrono::DateTime<chrono::Utc>,
    pub name: String,
    pub payload: T,
}
```

  e o enum de dispatch `#[serde(tag = "name")]` passa a incluir `id` e `time` — hoje somem.
- **Follow-up de higiene (opção A do §3.1)**: numa rodada separada, `_base.tsp` passa a
  declarar `{id, ownerId, time, name}` e os 38 eventos param de fingir `entityId`/
  `occurredAt`. Não bloqueia esta rodada; o rail garante que a migração não muda o split.

### F2 — Emissor Rust puro (corrige §2.2 e §2.4-doc/peso)

Reescrever `emit-wire-rs.ts` (nasce no **codedm**, backport pro template) emitindo structs
serde puros com o mapa de tipos do §3.2. Saída alvo por evento:

```rust
/// Published when a view is recorded. High volume; api-go consumes in batches.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ViewRecordedPayload {
    pub video_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub viewer_id: Option<String>,
    pub watch_time: i32,
    pub completion_ratio: f32,          // ← era String; agora é float de verdade
}

pub type ViewRecordedEvent = crate::wire::envelope::Envelope<ViewRecordedPayload>;
pub const VIEW_RECORDED_NAME: &str = "integration.view.recorded";
```

Regras mecânicas que o emissor carrega (cada uma com teste unit):
- doc do contrato vira `///` **no struct** (zero warnings, doc preservada);
- `camelCase`→`snake_case` com tratamento de sigla (`hlsUrl`→`hls_url`);
- keyword Rust → raw ident (`type`→`r#type`, `match`→`r#match`);
- opcional → `Option<T>` + `skip_serializing_if`; array opcional → `Vec<T>` + `#[serde(default)]`;
- `string-enum` inline → enum local `{Evento}{Campo}` com `#[serde(rename = "...")]` por valor;
- `Cargo.toml` gerado com deps mínimas: `serde`, `serde_json`, `chrono`, `uuid`, `strum`.
  **Sem** `template-core-rust` — o crate compila sozinho em ~2s.
- O DSL `integration_event!` continua existindo para o backend Rust do template; deixa de
  ser alvo do codegen. Se o backend quiser os eventos como cidadãos de domínio, envolve o
  struct puro (`impl From<ViewRecordedPayload> for ...`) — nunca o contrário.

### F3 — Uniões (corrige §2.3)

Ordem interna: **(a) spike → (b) union-ref → (c) union-slots.**

**(a) Spike progenitor+`oneOf`** (½ dia): gerar um spec mínimo com `oneOf`+`discriminator`,
rodar o binário `rust-codegen`, ler o que sai. Resultado esperado decide se o cliente ganha
enums tagged de graça ou se precisamos de pós-processamento. Registrar o achado aqui.

> **ACHADO (2026-07-30, spike executado):** progenitor 0.10 com `oneOf`+`discriminator`
> emite `#[serde(untagged)]` com variantes newtype (`TextContent(TextContent)`) — **ignora**
> o discriminator para o tagging serde. A discriminação acontece semanticamente: cada struct
> variante carrega seu campo discriminador como enum de 1 valor (`ImageContentMessageType`),
> então o untagged ainda resolve certo. Consequências: (1) as SHAPES das variantes vêm
> corretas e utilizáveis do cliente — a decisão (i) se sustenta; (2) o enum de dispatch do
> progenitor NÃO serve para forward-compat (valor desconhecido → erro "did not match any
> variant") — o `Slot<T>` do wire crate continua necessário e é quem carrega a regra §2.5.

**(b) `union-ref`** — `unions.rs` com um enum serde por união fechada:

```rust
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]                  // discriminador declarado no contrato
pub enum PaymentInstrument {
    #[serde(rename = "CARD")] Card(CardInstrument),
    #[serde(rename = "PIX")]  Pix(PixInstrument),
}
```

Pré-condição imposta pelo emissor: toda união fechada **declara discriminador** no contrato;
união sem discriminador é erro de compilação do contrato (mensagem aponta o `.tsp`), não
`#[serde(untagged)]` silencioso.

**(c) union-slots** — materialização única (wire/JSON, §3.3) com forward-compat obrigatória:

```rust
/// Slot de união: variante conhecida OU passthrough opaco (spec union-slots §2.5).
#[derive(Debug, Clone, PartialEq)]
pub enum Slot<T> { Known(T), Opaque(serde_json::Value) }
// Deserialize: tenta T pelo discriminador; qualquer não-match vira Opaque (log, nunca erro).
// Serialize: re-emite o Value original — round-trip sem perda.
```

O payload do evento com slot carrega `pub content: Slot<ChannelMessageReceivedContent>`,
onde o enum de variantes conhecidas é gerado com os braços espelhados de `schema.go`
(primário = slot com mais variantes; secundários estreitados pela interseção). As **formas**
das variantes vêm do cliente progenitor do dono (decisão §6.3-i) — o codegen wire só emite o
enum de dispatch + `Slot`, zero redeclaração de forma.

Teste-chave (o que separa "tem união" de "não quebra"): fixture com discriminador
desconhecido **parseia** para `Opaque` e re-serializa byte-idêntico.

### F4 — Enums duplicados cliente↔contracts (corrige §2.4)

Progenitor suporta substituição de tipos (`GenerationSettings::with_replacement`). O binário
`rust-codegen` ganha um passo: para cada enum cujo nome existe em `contracts-rust::wire::enums`,
substitui a definição local por re-export do crate de contracts. Resultado: **um** `VideoStatus`,
definido no contracts, visível no cliente. Rail negativo: grep no código gerado do cliente
proíbe `pub enum <NomeDeEnumDeContrato>`.

### F5 — Suíte vermelha + testes extensivos (corrige §2.4 e entrega §4)

1. Os 3 testes vermelhos **morrem nesta rodada**: os de Rust são reescritos contra o emissor
   puro (a intenção que eles já registravam); o de TS é corrigido junto. Gate: `bun test
   codegen/` verde é pré-condição de merge de qualquer coisa desta rodada.
2. Matriz unit §4.1 (13 kinds × req/opt + os casos mecânicos de F2).
3. **Fixtures compartilhadas** — `packages/contracts/fixtures/events/*.json`, uma por evento,
   geradas uma vez e commitadas. Três consumidores: teste Go, teste TS, teste Rust
   (`tests/roundtrip.rs` gerado pelo emissor — um `#[test]` por fixture: parse → serialize →
   parse → eq). A mesma fixture nos três é o que impede a divergência §2.1 de renascer.
4. Rail `wire-envelope-parity` (F1) + extensão do `union-parity` com resolver Rust.

### F6 — Crates standalone no padrão dos outros bindings (RETIFICADO pelo founder, 2026-07-30)

> Retificação: a versão anterior propunha um Cargo workspace na raiz agregando Tauri +
> gerados. **Vetado.** O workspace Cargo que existe é **do Tauri** (`src-tauri`), e continua
> sendo só dele. Rust não ganha workspace de linguagem — segue **exatamente** o padrão que
> os bindings TS e Go já seguem.

O padrão existente, medido no Go: `packages/contracts/generated/go` é um **módulo
standalone** (`module template/contracts-go`, go.mod próprio, `tests/` próprio, zero
go.work); consumidores apontam via `replace template/contracts-go => ../../contracts/
generated/go`. O TS idem: `generated/typescript` é um pacote npm standalone
(`@codedm/contracts-typescript`) resolvido pelo workspace Bun.

O Rust espelha isso 1:1:

```
packages/contracts/codegen/emit-wire-rs.ts     # tooling — Bun, ao lado de emit-wire-{ts,go}.ts
packages/contracts/generated/rust/             # crate standalone `codedm-contracts-rust`
    Cargo.toml                                 #   (deps mínimas de F2; compila sozinho)
    src/wire/{enums,events,unions,envelope}.rs
    tests/                                     #   round-trip fixtures (F5), como o Go tem tests/
packages/client/generators/rust/               # tooling — index.ts + crate auxiliar codegen
packages/client/dist/rust/                     # crate standalone `codedm-client-rust`
```

- Cada crate gerado é **auto-suficiente**: `cargo test` rodado com cwd no próprio crate,
  igual ao `go test ./...` do módulo Go. Sem lock/target compartilhado entre eles.
- O Tauri consome por **path dependency dentro do workspace dele**:
  `codedm-contracts-rust = { path = "../../../contracts/generated/rust" }` — path dep não
  exige membership; o crate é compilado dentro do target/lock **do Tauri**, exatamente como
  o `replace` do Go resolve no build do consumidor.
- O crate auxiliar do progenitor (`generators/rust/codegen`) roda via
  `cargo run --manifest-path ...` no script `generators/rust/index.ts` — detalhe interno do
  tooling, invisível fora dele.
- O comentário `UNVERIFIED-COMPILE` do `Cargo.toml` do shell morre aqui (obsoleto:
  `cargo 1.97.1` presente).

Custo aceito e explícito: builds standalone dos crates gerados recompilam deps
(serde/chrono) fora do cache do Tauri. Mitigado pelo cache do nx (F8) e pelo crate leve de
F2 (~2s). É o mesmo trade-off que o Go já paga — módulos independentes, consumidor resolve.

### F7 — Wiring Tauri com DX de SDK (entrega §3.5)

```rust
// src-tauri/src/api/mod.rs — construído UMA vez no setup, vive em tauri::State
pub struct Api { pub client: codedm_client_rust::Client }

#[tauri::command]
async fn sync_status(api: tauri::State<'_, Api>) -> Result<SyncStatusDto, ApiError> {
    api.client.go.get_sync_status().await.map_err(ApiError::from)
}
```

- URLs vêm do mesmo lugar que `sidecars/mod.rs` já define — zero literal novo.
- `X-Owner-Id` injetado por um middleware do reqwest no builder — o comando nunca monta header.
- Regra de casa (rail por grep): dentro de `src-tauri`, `reqwest` cru é proibido fora de
  `api/mod.rs`; todo comando fala com backend via `api.client.<serviço>.<método>()` — o
  espelho Rust do "nunca `fetch` direto" do frontend.

### F8 — Pipeline e comandos (a DX em si)

**Manifesto primeiro** (non-negotiable #5): `REPO.lang` ganha `rust: { cratePrefix: 'codedm' }`;
`sdkPackagePrefixes.rust = 'codedm-client'`. Nomes de crate derivam do manifesto, nunca
hardcoded no emissor.

**Comandos** — a regra é "os comandos que já existem passam a cobrir Rust", não comandos novos:

| comando | o que passa a fazer |
|---|---|
| `bun contracts` | tsp compile → emit ts/go/**rs** → `cargo check` no crate gerado (`--manifest-path packages/contracts/generated/rust/Cargo.toml` — gate de compilação no loop, ~2s com o crate leve de F2) |
| `bun sdk` | kubb (TS) + oapi-codegen (Go) + **progenitor (Rust)** quando o workspace rust existe no manifesto |
| `bun run test` | inclui `cargo test` **por crate** via targets nx `contracts-rust:test` / `client-rust:test` (run-commands com cwd no crate, cacheados por hash dos gerados — mesmo tratamento dos módulos Go) |
| `bun contracts --watch` | tsp watch + re-emit + cargo check — feedback de contrato quebrado em segundos |

**Nx**: `contracts-rust` e `client-rust` viram projetos nx (`project.json` com targets
`check`/`test`, `inputs` apontando pros arquivos gerados) para o cache funcionar e o
`nx affected` pegar mudança de contrato → rebuild Rust.

**Erros com endereço**: emissor falha com `wire/events/view-recorded.tsp → campo
completionRatio: float32 sem representação` — nunca stack trace de undefined. Todo `fail()`
do codegen carrega o nome do schema + campo.

### A DX final, na prática

> Dev adiciona `wire/events/thing-happened.tsp`, roda `bun contracts`:
> - ganha `ThingHappenedPayload` (TS + Go + Rust) com a mesma forma, provado por fixture;
> - se usou um shape sem suporte, o comando falha **apontando o campo do .tsp**;
> - `cargo check` no loop garante que o binding Rust compila antes do commit.
>
> Dev expõe endpoint novo no gateway, roda `bun sdk`:
> - `api.client.go.<novoMétodo>()` aparece tipado no Tauri, com enums de contrato
>   re-exportados (um tipo só) e uniões com narrowing + `Opaque` para variante futura.
>
> Dev no Tauri: injeta `tauri::State<Api>`, chama método tipado, nunca vê reqwest/JSON cru.
> Variante nova publicada pelo Go **não** derruba o shell — cai em `Opaque` e loga.
>
> CI: `bun tsc` + `bun run test` (inclui cargo) + rails de paridade — divergência de
> envelope/payload entre linguagens é vermelho de arquitetura, não bug de produção.

### Sequência com esforço estimado

| # | entrega | depende de | esforço |
|---|---|---|---|
| 1 | F3a spike progenitor `oneOf` | — | ½ dia |
| 2 | F1 envelope.ts + rail parity | — | 1 dia |
| 3 | F6 crates standalone + targets nx | — | ½ dia |
| 4 | F2 emissor puro + F5.1–2 (suíte verde, matriz) | 2 | 2–3 dias |
| 5 | F5.3 fixtures round-trip 3 línguas | 4 | 1 dia |
| 6 | F3b union-ref | 4 | ½ dia |
| 7 | F3c union-slots + `Slot<T>` | 1, 6 | 2 dias |
| 8 | F4 + port do gerador de cliente | 1, 3 | 1–2 dias |
| 9 | F7 wiring Tauri + fumaça | 8 | 1 dia |
| 10 | F8 comandos/nx/watch | 4, 8 | 1 dia |

1–3 são paralelizáveis (três frentes independentes). Caminho crítico: 2→4→5→7. Total ~2
semanas de esforço sequencial, ~1,5 com as frentes paralelas.

---

## 8. Não-objetivos desta rodada

- Reescrever o backend Rust (`packages/api/rust`) para consumir os structs puros.
- Estender o proc-macro DSL com heads de float/uuid/união (deixa de ser necessário se §3.2
  for aceito).
- Materialização "in-process" em Rust (§3.3: não é necessária enquanto Rust for cliente).
- Versionamento de variante (já não-objetivo no spec union-slots).
