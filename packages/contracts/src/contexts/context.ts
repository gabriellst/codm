import type { ContextId } from './context-ids.generated'
import type { ContextDecl as Base } from './decl'
import type { Namespace } from './namespaces'
import type { Placement } from './placement'

/**
 * O `ContextDecl` AMARRADO — o que todo `<ctx>/context.ts` importa, e o único import que ele
 * precisa ter.
 *
 * `./decl` define o contrato genérico; este alias é quem o prende às uniões DESTE produto. É a
 * costura que faz `consumes: { workspce: '…' }` (com typo) não compilar, sem que o contrato
 * genérico precise conhecer a lista de contextos.
 *
 * As TRÊS amarras vêm de contracts, e isso é o ponto: identidade de contexto, namespace e eixo de
 * alocação são estrutura de produto, língua-neutra. Com `Ns` amarrado em `Namespace`, as chaves de
 * `reads` ficam checadas pelo COMPILADOR — antes desta reforma o rail só descobria em tempo de
 * teste, porque `TABLE_READ_EDGES.schema` era `string` cru.
 *
 * Tudo é `import type`: some na compilação, então um `context.ts` não tem aresta de runtime — nem
 * para o kernel, nem para o gerado. É o que permite um rail ler a declaração sem instanciar nada.
 *
 * ── por que em CONTRACTS, e não em `api/typescript/src` ──────────────────────────────────────────
 * Porque tudo que este alias amarra mora aqui: o contrato genérico (`./decl`), a união de contextos
 * (`./context-ids.generated`), a de namespaces (`./namespaces`) e a forma da alocação
 * (`./placement`). Identidade e declaração de contexto são ESTRUTURA DE PRODUTO língua-neutra, e
 * contracts é a casa delas — o que deixa `src/` sendo só o que deve ser: o entry, os contextos de
 * domínio, e o código que LIGA o que aqui está declarado.
 *
 * A quarta peça é a que faltava, e é a razão de o alias ter morado em `src/` até agora: `Placement`
 * era `PlacementOf<Criteria, ContextInfra>` com a forma no kernel e os valores em
 * `src/shared/deployment.ts`. Um contrato escrito em três casas não tem onde ser amarrado. Com
 * `./placement`, tem.
 *
 * O kernel (core) fica de fora por construção: importar `ContextId` o faria conhecer a lista de
 * contextos do produto. Ele importa daqui — nunca o contrário.
 */
export type ContextDecl = Base<ContextId, Namespace, Placement> & {
	/**
	 * OBRIGATÓRIO neste produto, opcional em `./decl` — e essa é a peça que substitui a tabela
	 * central.
	 *
	 * `PLACEMENT` era `satisfies Record<ContextId, readonly Placement[]>`, e o docblock dela dizia que
	 * o valor disso era o falseador: *"contexto novo quebra o `tsc` AQUI até alguém dizer onde ele
	 * mora"*. Uma lista central de decisões por contexto é exatamente a forma que a DC2 já eliminou
	 * para `consumes`/`reads`/`ambient`, e ela tinha o mesmo defeito que motivou aquela mudança — o
	 * stamp do `create-template`, ao podar um contexto, não tinha como podar a linha dele.
	 *
	 * Tornando o campo obrigatório AQUI, o falseador não se perde: ele passa a cobrar a mesma resposta
	 * no arquivo do próprio contexto, que é onde a pergunta "onde isto roda?" tem dono.
	 *
	 * É também o que distingue este produto do template, que tem UM deployment: lá o terceiro
	 * parâmetro fica no default `never` e o campo é indeclarável. Aqui ele é exigido.
	 */
	placement: readonly Placement[]
}
