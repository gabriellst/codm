/**
 * A COSTURA DO TRADUTOR DE ERRO — o app registra, o design system consome.
 *
 * `field.tsx` precisa transformar a mensagem de erro de um formulário em texto legível. Quem sabe
 * fazer isso é o app: a tradução depende de `ERROR_CODES` (gerado do registro de erros dos
 * backends), dos stores de sessão/onboarding do console e da instância de i18n dele — o módulo
 * inteiro conhece o CONTRATO DA API.
 *
 * Um pacote de UI não pode conhecer nada disso. Se `@codm/app-ui` importasse aquele módulo, o
 * design system passaria a depender da SDK do produto que ele serve, e a seta apontaria para o lado
 * errado.
 *
 * Então a dependência é INVERTIDA e DECLARADA: o default devolve a mensagem verbatim (um pacote sem
 * app registra nada e continua funcionando), e o console chama `setErrorTranslator(translateError)`
 * no boot. Consumo é relação declarada (CLAUDE.md NN#5), não import que atravessa a fronteira.
 */
type ErrorTranslator = (message: string | undefined | null) => string

const verbatim: ErrorTranslator = message => message ?? ''

let translator: ErrorTranslator = verbatim

/** Chamado UMA vez, no boot do app. Sem ele os primitivos exibem a mensagem como veio. */
export function setErrorTranslator(fn: ErrorTranslator): void {
	translator = fn
}

/** Só para testes: devolve a costura ao estado de pacote-sem-app. */
export function resetErrorTranslator(): void {
	translator = verbatim
}

export function translateError(message: string | undefined | null): string {
	return translator(message)
}
