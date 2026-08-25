// `--mutation=<Hook>` — textarea + Enter-to-send + mutation.
//
// Existe porque o shape foi escrito à mão DUAS vezes (o Composer do thread e o
// IssueSteerComposer dentro do IssueDetailSection) com a mesma armadilha em cada:
// `Enter` sem `shift` envia, `Enter` com `shift` quebra linha, e o botão de envio
// morre com o texto vazio OU com a mutation pendente. Um dos dois esquecer o
// `|| pending` é um duplo-envio.
//
// O hook é o que ATIVA o bloco e também o que o alimenta — mesmo idioma de
// `--sdk=<Identifier>` (ativa o bloco `sdk` e preenche `ctx.sdk`). `ctx.mutationHook`
// e `ctx.sdk` coexistem: uma componente pode ler um tipo da SDK e disparar uma mutation.

import type { BlockFn } from './types'
import { renderBlock } from './fragments'
import { toCamelCase } from '../util/naming'

export const composerBlock: BlockFn = ctx => {
	if (!ctx.mutationHook) return {}
	return renderBlock('composer', 'react', {
		mutationHook: ctx.mutationHook,
		mutationVar: toCamelCase(ctx.mutationHook.replace(/^use/, '')),
		i18nPrefix: ctx.i18nPrefix ?? '',
	})
}
