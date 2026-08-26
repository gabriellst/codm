import { OwnerDirectory } from '@shared/services/OwnerDirectory'

/**
 * A PONTE DE CICLO DE VIDA do better-auth — o que acontece quando ELE cria um usuário ou uma sessão.
 *
 * Porte do `IdentityAuthHooks` do template, que existe pela mesma razão: o `BetterAuth.ts` é fiação,
 * e nenhuma regra de negócio deve morar dentro do literal de opções dele. Cada callback lá é UMA
 * chamada para cá.
 *
 * ── o buraco que este arquivo fecha ──────────────────────────────────────────────────────────────
 * Entrar criava um usuário e mais nada. `CreateOwner` e `SetActiveOwner` existiam — use case E
 * controller — com ZERO chamadores, e o próprio `BetterAuth.ts` dizia que o `activeOwnerId` seria
 * *"populated by a future SetActiveOwner use case"*. Esse futuro nunca chegou; o comentário do
 * arquivo registra que o bridge original foi removido com o colapso do operador e "NÃO é recriado
 * aqui".
 *
 * A consequência, medida em 2026-08-15: `owner_owners` com zero linhas e `active_owner_id` nulo na
 * sessão. Todo controller gateado declara `ctx: z.object({ ownerId: z.uuid() })`, e `null` reprova —
 * então o console recebia 400 em tudo, inclusive no `GetOnboarding`, que é como ele descobriria que
 * precisa de onboarding. O login funcionava e nada depois dele funcionava.
 *
 * ── a diferença para o template, e por que ela existe ────────────────────────────────────────────
 * Lá o `onUserCreated` cria um `UserProfile`, levanta `UserRegisteredEvent` e manda e-mail; o Owner
 * é criado explicitamente por quem consome a API. Aqui não há esse "quem": o desktop tem UM operador
 * por máquina e nenhuma tela de "criar organização". Provisionar no nascimento do usuário é o que
 * torna a conta utilizável — a alternativa é a que estava no ar, e ela não funcionava.
 */
export class IdentityAuthHooks {
	/**
	 * O diretório chega como THUNK, e não injetado — porque injetá-lo resolvia CEDO DEMAIS.
	 *
	 * `BoundedContext.create` aplica o registry DAQUELE contexto e, na linha seguinte, constrói o
	 * `Router`, que resolve cada controller. Então a cadeia
	 * `AuthPassthroughController` → `BetterAuth` → `IdentityAuthHooks` → `OwnerDirectory` era percorrida
	 * enquanto o `auth` registrava rotas — antes de o registry do `owner` existir. Sem binding, o
	 * tsyringe CONSTRÓI a classe abstrata: um objeto sem método nenhum. O sintoma foi
	 * `this.owners.ensureOwnerFor is not a function` no callback do Google, e um 500 na cara do
	 * operador depois de ele já ter autorizado.
	 *
	 * É a TERCEIRA vez que esta lição aparece nesta série, sempre com a mesma forma: o
	 * `PollingHealthCheck` guardava a instância do serviço e via um dispatcher que ninguém iniciou; o
	 * client do better-auth capturava `globalThis.fetch` no import e ignorava o dobro do teste. Um
	 * retrato tirado na construção descreve um mundo que ainda não existe — e descreve-o com confiança.
	 *
	 * O thunk é ligado por `useFactory` no `auth/registry.ts`, que fecha sobre o container. A resolução
	 * acontece na primeira chamada de hook, que é depois de todo contexto estar composto.
	 */
	constructor(private readonly resolveOwners: () => OwnerDirectory) {}

	/**
	 * O better-auth acabou de criar um usuário — ele ganha seu espaço aqui.
	 *
	 * IDEMPOTENTE por contrato: o hook roda dentro do caminho de criação dele, que pode ser
	 * reexecutado, e dois donos para o mesmo usuário é pior que nenhum. Consultar antes de criar é
	 * mais barato que desfazer.
	 */
	async onUserCreated(input: { userId: string; email: string; name?: string | null }): Promise<void> {
		// A porta é idempotente — encontrar não custa e criar duas vezes não acontece. O nome do
		// espaço é o do usuário; sem ele, a parte local do e-mail.
		await this.resolveOwners().ensureOwnerFor({ userId: input.userId, name: input.name ?? input.email.split('@')[0] })
	}

	/**
	 * O contexto que uma sessão NOVA carrega — hoje, só o dono ativo.
	 *
	 * Separado do `onUserCreated` porque os dois momentos são diferentes: no `user.create` ainda não
	 * existe sessão para carimbar, e num login SEGUINTE não há usuário novo para provisionar. `null`
	 * quando o usuário não tem dono — e aí o middleware recusa, que é a verdade, em vez de inventar
	 * um id como o `OPERATOR_ID` fazia antes do ADR 0001.
	 */
	async sessionContext(userId: string): Promise<{ activeOwnerId: string }> {
		// GARANTE, não só consulta — ver o docblock de `ensureOwnerFor`. Contas criadas antes desta
		// costura existir não têm dono e o `user.create` não roda de novo para elas; garantir aqui é o
		// que as cura no próximo login, em vez de deixá-las quebradas para sempre.
		return { activeOwnerId: await this.resolveOwners().ensureOwnerFor({ userId }) }
	}
}
