/**
 * `kill(pid, 0)` — sonda sem entregar sinal. Vivia como função privada de `DataDirLock` ("o dono do
 * lock ainda existe?"); o parent watchdog precisa da MESMA pergunta ("o shell ainda existe?"), e no
 * Windows ela é a única que responde — lá o ppid registrado congela no spawn, então "fui
 * reparentado?" nunca vira verdadeiro.
 *
 * Semântica preservada byte-a-byte: EPERM ⇒ o processo existe mas não é nosso para sinalizar
 * (vivo); ESRCH ⇒ não existe (morto). No Windows o libuv responde a `kill(pid, 0)` com
 * OpenProcess + GetExitCodeProcess, com os mesmos dois códigos. Sem dependências: continua
 * publicável pelo subpath `@codm/core-typescript/db/lock`, que exige "só builtins".
 */
export function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false
	try {
		process.kill(pid, 0)
		return true
	} catch (err) {
		// EPERM ⇒ the process exists but we can't signal it (still alive). ESRCH ⇒ no such process.
		return (err as NodeJS.ErrnoException).code === 'EPERM'
	}
}
