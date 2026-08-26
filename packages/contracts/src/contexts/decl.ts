/**
 * O CONTRATO de uma declaração de bounded context — o que um contexto DECIDE sobre si mesmo.
 *
 * Genérico sobre `Ctx` e `Ns` de propósito: o KERNEL (core) não conhece — e não pode conhecer — a
 * lista de contextos nem a de namespaces do produto, e é por isso que este contrato NÃO mora em
 * core: um pacote que nunca o consome seria só um segundo endereço para a mesma ideia. Ele mora
 * AQUI, em contracts/contexts/, ao lado das TRÊS coisas que o parametrizam
 * (`context-ids.generated.ts`, `namespaces.ts`, `placement.ts`) e do alias que as amarra
 * (`./context.ts`) — que é o que todo `<ctx>/context.ts` importa. Um import só, e ainda assim
 * errar o nome de um contexto quebra o `tsc`.
 *
 * ── o terceiro parâmetro é USADO aqui, diferente do template ─────────────────────────────────────
 * `Placement` fica no default `never` num produto com um deployment só, e o campo abaixo vira
 * indeclarável. Este produto tem dois (o daemon de desktop e a nuvem), então o alias amarra o
 * parâmetro e torna `placement` OBRIGATÓRIO — a assimetria que o docblock do campo descreve.
 *
 * Isso só é possível porque a forma da alocação mora ao lado, em `./placement`. Enquanto
 * `PlacementOf` esteve no kernel e os valores em `api/typescript/src/shared/`, este contrato estava
 * partido em três pacotes e o alias não tinha onde encontrar as próprias peças.
 *
 * DOMÍNIO, e só domínio. Nada aqui nomeia mecanismo físico de um dialeto — `namespace` é o nome
 * LÓGICO, e como ele vira tabela é decisão do resolvedor de dialeto, não deste tipo. Foi
 * exatamente a confusão inversa (um campo `pgSchema` num registro de identidade de domínio) que
 * originou esta reforma.
 *
 * INERTE. Este arquivo não importa valor nenhum, e os `context.ts` que o consomem também não —
 * `import type` some na compilação. É o que deixa um rail ou o gerador lerem a declaração de um
 * contexto sem instanciar container, abrir recurso ou arrastar o tsyringe.
 */
export interface ContextDecl<Ctx extends string = string, Ns extends string = string, Placement = never> {
	/**
	 * ONDE este contexto monta, e com que infra — a decisão de alocação, declarada pelo contexto que
	 * ela descreve.
	 *
	 * O kernel NÃO conhece a forma de um placement: `Placement` é um parâmetro, e o default `never`
	 * significa "este produto não tem eixo de deployment", que é o caso do template. Quem amarra a
	 * forma é o alias do produto (`src/context.ts`), exatamente como já faz com `Ctx` e `Ns`.
	 *
	 * Opcional AQUI e OBRIGATÓRIO no alias do produto, e a assimetria é o ponto: um fork sem segundo
	 * deployment simplesmente não declara nada, enquanto neste produto um contexto novo não compila
	 * até dizer onde mora. Isso preserva o falseador que a tabela central `PLACEMENT` tinha
	 * (`satisfies Record<ContextId, …>`) e o move para onde a decisão vive.
	 */
	placement?: readonly Placement[]

	/**
	 * O VOCABULÁRIO PÚBLICO que este contexto contribui à spec — quais dos seus barris viram
	 * componentes nomeados no OpenAPI, e portanto na SDK que viaja no bundle do browser.
	 *
	 * DECLARADO, nunca derivado da existência do barril, e a diferença é uma fronteira de segurança:
	 * medido em 2026-08-18, `agent` TEM `enums/` e não é registrado, `auth` e `thread` TÊM `objects/` e
	 * não são registrados. Registrar por existência publicaria os três no dia seguinte, em silêncio.
	 *
	 * `objects` em particular: `registerSchemas` expõe o conjunto COMPLETO de campos de um schema e o
	 * `.refine()` verbatim. Um value object de contexto é interno ao domínio por padrão; o que
	 * genuinamente cruza o fio aparece quando um controller o referencia — decisão por endpoint, não
	 * exportação em bloco.
	 */
	exposes?: { readonly enums?: boolean; readonly objects?: boolean }

	/**
	 * O QUE este contexto é. `kernel` é a infra da máquina (outbox, events, idempotency) — não um
	 * peer, e é dele que sai tanto o `AMBIENT: '*'` quanto o primeiro lugar na ordem de boot.
	 * Substitui o fato que hoje mora dentro de strings de prosa nos `why` do mapa de contexto.
	 */
	kind: 'domain' | 'kernel' | 'bff' | 'edge'

	/**
	 * O namespace LÓGICO que este contexto possui. Declare SÓ quando ele difere da chave do módulo
	 * (`auth` → `authentication`); omitido, a convenção vale. `null` diz que o contexto não
	 * persiste — e dizer isso é diferente de esquecer de declarar.
	 */
	namespace?: Ns | null

	/**
	 * Superfícies que QUALQUER contexto pode importar sem aresta declarada. `kind: 'kernel'` implica
	 * `'*'`; um contexto de domínio declara a lista (o guard de sessão e o de tenancy pegam carona
	 * em todo router, e isso é papel de infra, não dependência).
	 */
	ambient?: readonly string[]

	/** Política de propriedade no trem de sync. Hoje esta informação vive duplicada em 3 arquivos. */
	tier?: 1 | 2 | 3 | 4

	/**
	 * Arestas de IMPORT DE MÓDULO: `import { X } from '@outro/repositories'`. Chave = o contexto
	 * fornecedor, valor = o porquê, obrigatório.
	 *
	 * Distinto de `reads`, e a distinção é o ponto: o rail de import é ESTRUTURALMENTE CEGO ao outro
	 * canal, porque uma leitura de tabela importa de `contracts`, não de `@<ctx>/`.
	 */
	consumes?: Partial<Record<Ctx, string>>

	/**
	 * Leituras de TABELA cross-namespace. Chave = o NAMESPACE alvo, não o contexto — e são uniões
	 * diferentes porque um namespace pode pertencer a um workspace que não é contexto TS (o schema
	 * do gateway Go). Chavear isto por contexto tornaria impossível declarar "o BFF lê tabela do Go".
	 *
	 * Uma aresta aqui quase sempre é uma costura de código faltando: o conserto canônico é criar o
	 * repositório do dono e passar a importá-lo, o que converte a aresta em `consumes`.
	 */
	reads?: Partial<Record<Ns, string>>

	/**
	 * Os helpers `given*` que ESTE contexto contribui ao catálogo do harness de teste (F3/T5).
	 *
	 * Nomes de export, exatamente como o barril de `tests/support/given/` os exporta — e é por isso
	 * que `GIVEN_MENTION_TAG` cabe aqui ao lado das funções: o catálogo é a superfície pública do
	 * harness, não uma lista de funções.
	 *
	 * ── POR QUE AQUI, E NÃO NUM MANIFESTO CENTRAL ────────────────────────────────────────────────
	 * A tarefa original mandava declarar isto em `template.config.ts`, como `REPO.contexts.<ctx>.givens`.
	 * Medido: aquilo ressuscitaria, em outro arquivo, exatamente a LISTA CENTRAL DE CONTEXTOS que a
	 * DC2 apagou para fazer a pasta virar o spine — e um contexto novo voltaria a precisar ser
	 * lembrado em dois lugares. O fato "quais givens são meus" é do contexto; ele mora com o contexto.
	 *
	 * ── O DEFEITO QUE ISTO CURA ──────────────────────────────────────────────────────────────────
	 * Os mesmos nomes viviam redeclarados à mão em quatro lugares (o CATALOG do rail
	 * `testing-dts.test.ts`, o barril `given/index.ts`, os re-exports de `tests/support/testing.ts` e
	 * o `testing.d.ts` commitado). Nenhum deles sabia a que contexto cada nome pertence, então o
	 * stamp do `create-template`, ao podar um contexto, não tinha como podar os givens dele: o fork
	 * ficava com um catálogo prometendo helpers de um contexto que não existe mais.
	 *
	 * ── UM GIVEN NEM SEMPRE SEMEIA O NAMESPACE DO PRÓPRIO CONTEXTO ───────────────────────────────
	 * `givenChannel`/`givenRemote`/`givenRemoteMembership`/`givenConnectedGatewayChannel` escrevem em
	 * `gateway.*`, um namespace do workspace GO — nenhum contexto TS o possui. Eles são declarados
	 * por `shared`, que é quem possui a COSTURA (o `TestIngressController`) e que já declara
	 * `reads.gateway` por essa mesma razão. O dono do given é quem responde por ele, não quem por
	 * acaso lê a tabela.
	 */
	givens?: readonly string[]

	/**
	 * As CONSTANTES do catálogo de teste — mesma superfície que `givens`, forma diferente.
	 *
	 * Separado porque a distinção é REAL e é consumida: `testing.d.ts` é escrito à mão e precisa emitir
	 * `export const GIVEN_MENTION_TAG: string` para uma e `export function givenThread(…)` para a outra.
	 * Achatadas num array só, a informação existe no símbolo mas NÃO na declaração — quem lê o agregado
	 * vê strings e não sabe qual pode chamar.
	 *
	 * Veio da T5 do `feat/upstream-prep`, que já as separava (`constants: ['GIVEN_MENTION_TAG']`). O
	 * resto do desenho dela — a lista central em `template.config.ts` — foi superado por `givens` viver
	 * no contexto, mas esta metade ela acertou.
	 *
	 * NÃO derivado da grafia (`SCREAMING_CASE` = constante): é convenção de nome, e uma rail baseada em
	 * convenção de nome foi exatamente o que apodreceu na WIRE-01 desta mesma sessão.
	 */
	constants?: readonly string[]

	/** O que o stamp precisa saber para podar este contexto. O `why` é MEDIÇÃO, não gosto. */
	removable?: { pairedWith?: readonly Ctx[]; why: string }

	/** Capabilities que o fork precisa ter para este contexto embarcar. Ausência é a declaração. */
	requires?: readonly string[]
}
