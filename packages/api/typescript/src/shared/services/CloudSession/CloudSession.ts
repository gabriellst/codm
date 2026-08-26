import type { Session } from '@shared/schemas'

/**
 * A PORTA PARA A IDENTIDADE — que mora na NUVEM, e só lá.
 *
 * ── o que esta porta deixou de ser ───────────────────────────────────────────────────────────────
 * Ela era um CACHE: guardava em disco o token e, ao lado dele, QUEM a nuvem tinha dito que ele era,
 * revalidando de hora em hora. `identity()` era síncrona e lia esse arquivo. Três coisas vinham
 * junto, e as três eram defeito:
 *
 *   1. **duas autoridades.** A nuvem respondia "quem é você" pelo better-auth; o daemon respondia
 *      pelo arquivo. Elas podiam discordar por até uma hora, e nesse intervalo a do disco vencia.
 *   2. **o `ownerId` voltava a ser local.** O ADR 0001 existe para apagar identidade cunhada na
 *      máquina; o cache a recolocava num arquivo que quem tem o disco edita. Que a revalidação
 *      corrigisse depois não muda o que valia enquanto isso.
 *   3. **um deadlock de bootstrap.** O daemon só recebia token por `POST /session/cloud-token`,
 *      e aquele controller era gateado por este `identity()` — que só existia depois do token. Numa
 *      instalação nova a porta que entrega a credencial exigia a credencial, respondia 401, e o
 *      console ENGOLIA o erro ("best-effort"). O daemon nunca era destravado.
 *
 * Agora não há identidade cacheada. O que sobra em disco é o TOKEN, e só ele — a credencial que o
 * console entregou. Quem a interpreta é sempre a nuvem.
 *
 * ── por que os dois métodos têm cadências diferentes ─────────────────────────────────────────────
 * `identity()` responde a uma REQUISIÇÃO e vai à nuvem toda vez: a cadência é humana, o custo é um
 * round-trip por clique, e a contrapartida é que uma revogação vale no mesmo instante.
 *
 * `isEntitled()` gateia o `MailboxDispatcher`, cujo `drainLoop` roda a cada 250ms–2s. A mesma
 * pergunta ali seriam 0,5–4 requisições por segundo, para sempre — então esta é memoizada por uma
 * janela curta. Não é o cache antigo de volta: não guarda IDENTIDADE (não há `ownerId` em lugar
 * nenhum), não sobrevive ao processo, e a janela é de segundos e não de uma hora.
 */
export abstract class CloudSession {
	/** Guarda a credencial que o console entregou. Não valida — quem valida é a nuvem, na leitura. */
	abstract setToken(token: string): void

	/**
	 * Quem é o dono desta máquina, PERGUNTANDO À NUVEM agora.
	 *
	 * `null` significa "não há credencial" ou "a nuvem recusou esta credencial" — os dois casos em
	 * que o daemon não deve servir nada. Uma falha de REDE não é nenhum dos dois e PROPAGA: um
	 * daemon que respondesse "não autenticado" porque a internet caiu estaria mentindo sobre a
	 * causa, e mandaria o operador refazer login para resolver um problema que não é dele.
	 */
	abstract identity(): Promise<Session | null>

	/** Este install pode trabalhar. Memoizado — ver a nota de cadência acima. */
	abstract isEntitled(): Promise<boolean>
}
