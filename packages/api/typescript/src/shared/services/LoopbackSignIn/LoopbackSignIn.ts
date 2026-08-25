import { singleton } from 'tsyringe-neo'

/**
 * O CÓDIGO DE LOGIN, entre o browser e o console — um cofre de UMA gaveta, em memória.
 *
 * ── por que existe ───────────────────────────────────────────────────────────────────────────────
 * O login termina no NAVEGADOR DO SISTEMA, e quem precisa do código é o CONSOLE, que roda noutro
 * processo. O deep link `codm://` fazia essa travessia e deixou de servir: no macOS ele exige um
 * `.app` registrado, o `tauri dev` não gera bundle, e o registro em runtime é recusado pela
 * plataforma — então em desenvolvimento o link ia para o app instalado, não para o que estava
 * rodando. O loopback do RFC 8252 põe a travessia dentro da máquina, por HTTP, e este objeto é o
 * ponto de encontro: o browser DEPOSITA, o console RETIRA.
 *
 * ── por que em memória, e por que uma gaveta só ─────────────────────────────────────────────────
 * O código já é de uso único e vive dois minutos (é o `one-time-token` do better-auth). Persistir em
 * disco daria a ele uma vida que o emissor não lhe deu, e um reinício do daemon no meio de um login
 * significa que o login falhou de qualquer forma — a resposta certa é entrar de novo, não ressuscitar
 * um código.
 *
 * Uma gaveta porque há UM operador por máquina (spec: "sem multi-conta por máquina"). Um segundo
 * login iniciado antes de o primeiro ser retirado SOBRESCREVE — e é o comportamento correto: o
 * código mais novo é o que o operador acabou de autorizar, e o anterior é lixo que ele abandonou.
 */
@singleton()
export class LoopbackSignIn {
	private code: string | undefined

	/** O browser chegou com o código. */
	deliver(code: string): void {
		this.code = code
	}

	/**
	 * O console retira — e a gaveta fica VAZIA.
	 *
	 * Retirar consome de propósito: um `peek` faria o console, que consulta em laço enquanto a tela
	 * de login está aberta, tentar resgatar o MESMO código repetidamente contra a nuvem. A segunda
	 * tentativa falharia (o token é de uso único lá também) e o operador veria um erro depois de um
	 * login que funcionou — exatamente o modo de falha que a deduplicação do deep link existia para
	 * evitar. Consumindo aqui, o laço encontra o código uma vez e só.
	 */
	claim(): string | undefined {
		const code = this.code
		this.code = undefined
		return code
	}
}
