/**
 * ALOCAÇÃO — a FORMA de "este contexto monta quando <critérios>, com <infra>", e os valores deste
 * produto que a preenchem.
 *
 * ── por que aqui, e não metade no kernel e metade em `src/` ──────────────────────────────────────
 * Porque isto é UM contrato, e ele estava escrito em três casas. `ContextDecl` (`./decl`) declara
 * `placement?: readonly Placement[]`; a forma desse campo (`PlacementOf`) morava no kernel e os
 * valores (`Deployment`, `DatabaseFamily`) em `api/typescript/src/shared/deployment.ts`. Nenhuma
 * das três casas continha as outras duas, e é por isso que o alias amarrado (`./context.ts`) não
 * tinha onde morar junto do que amarra — o que mantinha `<ctx>/context.ts` importando de dentro de
 * um workspace em vez do contrato.
 *
 * A direção é de mão única e já era a praticada: o core importa `@codm/contracts` em produção, e
 * contracts NUNCA importa o core. Trazer a forma para cá respeita essa direção; levar as uniões
 * deste produto para lá a inverteria.
 *
 * ── o que NÃO veio junto, e por quê ──────────────────────────────────────────────────────────────
 * A COMPUTAÇÃO. `placementFor`, `mountedContextsOf` e `keysOf` continuam no kernel
 * (`core/src/types/Placement.ts`), genéricos sobre `<Ctx, Criteria, Infra>`, e o invariante que o
 * docblock de lá protege segue de pé: o kernel nunca aprende que existe um `deployment`, muito
 * menos que ele pode ser `'cloud'`. Ele opera sobre a forma; quem a nomeia é este arquivo.
 *
 * Também ficou em `src/shared/deployment.ts` tudo que toca runtime: a tabela `PLACEMENT` (derivada
 * do gerador), `criteriaFromEnv` (lê `CODM_PROFILE`) e `InfraModules` (fala `InstanceRegistry`, que
 * é do kernel). Contracts declara; o produto liga.
 *
 * ── e o eixo é REAL ──────────────────────────────────────────────────────────────────────────────
 * Este produto tem dois deployments (o daemon de desktop e a nuvem), diferente do template, que tem
 * um só e por isso deixa o terceiro parâmetro de `ContextDecl` no default `never`. É exatamente o
 * caso que o kernel prevê: um fork com eixo real amarra a forma no alias DELE e torna `placement`
 * obrigatório — ver `./context.ts`.
 *
 * INERTE. Só tipos, zero imports, nada que instancie. É o que permite um rail ou o gerador lerem a
 * declaração de um contexto sem abrir recurso.
 */

/** Um eixo de infra que pode estar AUSENTE. `'none'` é uma afirmação, não um buraco: diz que o
 *  contexto não usa aquele eixo, em vez de forçá-lo a escolher um valor que não vai exercer.
 *  É um valor do domínio, não a ausência de um. Ver ADR 0004. */
export type Axis<T> = T | 'none'

/** "Este contexto monta quando <when>, com <infra>." `when` parcial: `{}` significa "sempre", e um
 *  critério novo entra como mais uma chave sem mudar a forma. */
export interface PlacementOf<Criteria, Infra> {
	readonly when: Partial<Criteria>
	readonly infra: Infra
}

/**
 * As famílias de persistência vivas: `libsql` (o daemon de desktop) e `pg` (o deployment de nuvem).
 *
 * A `pg` entrou em 2026-08-14, e entrou ACOMPANHADA — o que é a parte que importa. Virar esta linha
 * sozinha teria produzido uma declaração que ninguém lê: sem descritor declarando `infra` e sem o
 * laço de composição APLICANDO o módulo da família, o `db: 'pg'` da tabela seria decorativo, e a
 * `PLACEMENT` estaria descrevendo um mundo que o código não constrói. Um gate vazio — a doença que
 * este desenho existe para curar. Por isso o flip, os bindings e a amarra aterrissaram no MESMO
 * diff. O registro completo (co-propriedade do dado, aplicador de migração por ADR 0005, hierarquia
 * de drivers por ADR 0006) está em `src/shared/deployment.ts`, junto de quem os LIGA.
 *
 * Acrescentar uma TERCEIRA família continua sendo uma linha aqui — e o `tsc` passa a cobrar o
 * módulo dela em todo descritor que declara o eixo `db`.
 */
export type DatabaseFamily = 'libsql' | 'pg'

/**
 * A ÚNICA declaração de eixos de infra. Um eixo novo (cache, blob store, fila) é UMA linha aqui,
 * e propaga sozinho para `ContextInfra`, para `InfraModules` e para a amarra de boot.
 *
 * Ninguém redigita `'db'` fora daqui — literal solto é a doença que a identidade de contexto já
 * combate ("a typo or a stale rename fails `tsc` at every call site instead of silently drifting").
 */
export interface InfraChoices {
	db: DatabaseFamily
	// cache: CacheKind        ← um eixo novo é UMA linha aqui
}

/**
 * A escolha de UM contexto sobre CADA eixo. Derivado de `InfraChoices` — nenhum campo é opcional,
 * de propósito (ADR 0004).
 *
 * A exaustividade tem DUAS dimensões, e as duas são falseadores:
 *   contexto novo  → o `tsc` quebra na tabela, porque falta a chave
 *   eixo novo      → o `tsc` quebra nas DEZ linhas, porque falta o campo
 *
 * A forma descartada era `Partial<InfraChoices>` com `{}` para "nenhum eixo": ela resolve o
 * primeiro caso e destrói o segundo, porque `Partial` torna TODO campo opcional e um eixo novo
 * passaria a valer para ninguém, em silêncio. E `{}` não se distingue de esquecimento, enquanto
 * `db: 'none'` diz que alguém olhou.
 */
export type ContextInfra = { [K in keyof InfraChoices]: Axis<InfraChoices[K]> }

/** Os deployments que existem. */
export type Deployment = 'cloud' | 'local'

/**
 * Critérios como REGISTRO ABERTO, não como um nome.
 *
 * Hoje um critério; amanhã região, SO ou tier de instância dedicada entram AQUI, e a lógica entra
 * no corpo de `placementFor` — nenhum chamador muda, porque nenhum chamador jamais soube que era
 * uma consulta.
 *
 * O que NÃO é critério: `tier` (FREE/PRO). Um processo serve os dois ao mesmo tempo, e não se
 * compõe container por owner. Régua: *se a diferença exige binding diferente no container, é
 * composição; se exige verificação por request, é política.*
 */
export interface Criteria {
	deployment: Deployment
	// region?: 'eu' | 'us'      ← critério novo entra aqui
}

/**
 * "Este contexto monta quando <critérios>, com <infra>."
 *
 * `when` é um `Partial<Criteria>`: um `when` vazio significa "sempre", e um critério novo entra
 * como mais uma chave sem mudar a forma da tabela.
 */
export type Placement = PlacementOf<Criteria, ContextInfra>
