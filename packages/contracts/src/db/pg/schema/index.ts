/**
 * O TRONCO CLOUD — dialeto `postgresql`, 13 tabelas, e **nada mais que isso**.
 *
 * O ADR 0005 decidiu dois troncos, e a metade que importa da decisão é a segunda: este NÃO é um
 * espelho do tronco SQLite. Ele carrega exatamente as tabelas dos contextos que a `PLACEMENT`
 * (ADR 0002) aloca na nuvem — `auth`, `owner` e a linha cloud de `shared` — e nenhuma outra.
 *
 * Os seis exports que você NÃO encontra aqui, e por quê:
 *
 *   workspace · thread · issue · agent · artifact · channel
 *
 * Eles são o trabalho do usuário, na máquina do usuário, contra o arquivo SQLite do desktop.
 * Espelhá-los aqui por simetria criaria tabelas que ninguém escreve — e uma tabela que existe é um
 * convite. A ausência delas é a decisão, não um esquecimento: `tests/architecture/trunk-parity.test.ts`
 * DERIVA da `PLACEMENT` quais contextos podem aparecer neste tronco e reprova se um a mais entrar.
 *
 * `infrastructure` aparece nos DOIS troncos, e isso não é duplicação: é o kernel (a mecânica da
 * transação, não do domínio), pela mesma razão que faz `shared` ser o único contexto DUAL na
 * `PLACEMENT`. Também é a única parte com gate de forma, porque é a única onde divergir em silêncio
 * é possível.
 */
export * from './auth'
export * from './owner'
export * from './infrastructure'
