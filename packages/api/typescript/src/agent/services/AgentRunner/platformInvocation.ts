/**
 * COMO INVOCAR O BINÁRIO DO PROVEDOR NESTE SISTEMA — e por que isso não é detalhe de chamada.
 *
 * No Windows, o `claude` instalado pelo npm não é um executável: é `claude.cmd`, um script de lote
 * que o `cmd.exe` interpreta. `child_process.spawn` recusa executá-lo diretamente — desde a correção
 * do CVE-2024-27980 o Node não deixa mais um `.cmd`/`.bat` passar por `spawn` sem shell, e o erro
 * que sobe é `EINVAL`, seco. Foi exatamente o que o founder viu no PRIMEIRO teste real em Windows
 * (2026-08-27), com o agente respondendo três vezes "tive um problema para terminar essa tarefa"
 * antes de desistir:
 *
 *     SERVER_ERROR: TERMINAL_SPAWN_FAILED: failed to spawn
 *     C:\Users\…\AppData\Roaming\npm\claude.cmd: SystemError: spawn … EINVAL
 *
 * A extensão NÃO é convenção nossa a inferir — é o contrato do próprio sistema operacional sobre o
 * que aquele arquivo é. Por isso a decisão vive aqui, nomeada e testável, em vez de virar um `if`
 * dentro de cada lugar que chama um provedor (hoje dois: o spawner do runner e a sonda do detector,
 * que roda `--version`/`--help` e falhava do mesmo jeito, silenciosamente).
 *
 * `shell: true` seria a correção de uma linha, e é a errada: ele manda a linha inteira para o
 * interpretador sem escapar nada, e os argumentos incluem CAMINHOS DE PASTA do operador
 * (`--add-dir C:\Users\Fulano\Meus Projetos`). Aqui os argumentos são citados um a um e entregues
 * verbatim, que é o que `windowsVerbatimArguments` significa.
 */

/** O que o chamador entrega ao `spawn`: arquivo, argumentos e as opções que a plataforma exige. */
export interface Invocation {
	file: string
	args: string[]
	/** Só definido no caminho do Windows — no POSIX o objeto sai vazio, sem chave alguma. */
	options: { windowsVerbatimArguments?: true }
}

/** O interpretador de lote do Windows, pelo caminho que o próprio sistema anuncia (`ComSpec`), com
 *  fallback para o nome — uma instalação sem `ComSpec` é anômala, mas não é motivo para falhar aqui. */
function comspec(): string {
	return process.env.ComSpec ?? process.env.COMSPEC ?? 'cmd.exe'
}

/**
 * Citação para a linha de comando do `cmd.exe`.
 *
 * Envolve em aspas SEMPRE (não só quando há espaço): um caminho do Windows sem espaço hoje pode ter
 * amanhã, e uma regra uniforme não tem caso de borda para esquecer. As barras invertidas que
 * precedem uma aspa são duplicadas antes de escapá-la — regra do parser do CRT, sem a qual
 * `C:\dir\"` termina a citação no lugar errado.
 *
 * LIMITE CONHECIDO, escrito porque some quando não está escrito: dentro de aspas o `cmd.exe` ainda
 * expande `%VAR%`. Um caminho com `%` no nome chegaria alterado. Nenhum dos nossos argumentos hoje
 * (flags, ids de sessão, diretórios de workspace) tem por que conter `%`, e a alternativa —
 * desabilitar a expansão — exigiria outro nível de citação que introduz mais casos do que resolve.
 */
export function quoteForCmd(argument: string): string {
	const escaped = argument.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')
	return `"${escaped}"`
}

/** Um arquivo que só o interpretador de lote sabe executar — o contrato do sistema, não nosso. */
function isBatchScript(binary: string): boolean {
	return /\.(cmd|bat)$/i.test(binary)
}

/**
 * A invocação para ESTE sistema. Fora do Windows, e no Windows para um `.exe` de verdade, é a
 * identidade: o binário e seus argumentos, sem intermediário.
 *
 * `platform` é parâmetro (com o default certo) porque é o que permite testar a decisão do Windows
 * numa máquina que não é Windows — a alternativa seria não testá-la, que é como ela chegou até aqui.
 */
export function resolveInvocation(binary: string, args: readonly string[], platform: NodeJS.Platform = process.platform): Invocation {
	if (platform !== 'win32' || !isBatchScript(binary)) {
		return { file: binary, args: [...args], options: {} }
	}

	// `/d` ignora AutoRun do registro (um `cmd.exe` de máquina alheia não decide o que roda antes do
	// nosso comando); `/s` fixa a regra de citação do resto da linha; `/c` executa e sai.
	const line = [binary, ...args].map(quoteForCmd).join(' ')
	return { file: comspec(), args: ['/d', '/s', '/c', line], options: { windowsVerbatimArguments: true } }
}
