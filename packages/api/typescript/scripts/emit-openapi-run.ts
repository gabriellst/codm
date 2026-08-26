/**
 * Lançador do `emit-openapi` — existe porque `VAR=valor comando` é sintaxe de shell POSIX, e o
 * `cmd.exe` do Windows não a entende.
 *
 * O alvo nx trazia `EMIT_OPENAPI=true START_SERVER=false bun run scripts/emit-openapi.ts`. Isso
 * funcionou por meses porque todo build acontecia em macOS ou Linux; no primeiro build nativo em
 * `windows-latest` (2026-08-26, migração dos runners) a linha virou
 * `'EMIT_OPENAPI' is not recognized as an internal or external command` e derrubou a perna inteira,
 * antes de compilar coisa alguma.
 *
 * POR QUE UM LANÇADOR, E NÃO UMA ATRIBUIÇÃO DENTRO DO PRÓPRIO `emit-openapi.ts`: aquele módulo
 * documenta (e depende disso) que a flag TEM de estar no ambiente ANTES de a raiz de composição ser
 * avaliada — ESM resolve os `import` estáticos antes de qualquer linha do corpo rodar, então uma
 * atribuição lá dentro chegaria tarde e o banco real subiria. Aqui a diferença é o `import()`
 * DINÂMICO: ele só resolve quando esta linha executa, ou seja, depois das atribuições acima dele.
 * A guarda `require-emit-env` continua valendo e continua falhando alto para quem invocar o script
 * de verdade direto, sem env.
 *
 * O perfil vem por ARGUMENTO (`--cloud`) em vez de uma terceira variável na linha de comando: o
 * ponto do arquivo é não haver nenhuma atribuição de env na invocação.
 */
process.env.EMIT_OPENAPI = 'true'
process.env.START_SERVER = 'false'
if (process.argv.includes('--cloud')) process.env.CODM_PROFILE = 'cloud'

await import('./emit-openapi')
