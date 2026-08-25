import { Config } from '@codm/core-typescript'
import { ChannelProxy } from './ChannelProxy'

export { ChannelProxy } from './ChannelProxy'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10) — e aqui a seleção é CONDICIONAL.
 *
 * CARVE-OUT DE OPENAPI: o `ChannelProxy` é um curinga de runtime (`/external/channel/*`) que não pode
 * vazar para o `openapi.json` / a SDK — a spec do próprio gateway é a superfície tipada, e o kubb
 * engasgaria um catch-all `channel/*` sem sentido dentro de todo cliente. A emissão roda com
 * `EMIT_OPENAPI=true` e só colhe routers, então montar zero controllers ali mantém a spec limpa
 * enquanto todo boot real monta o proxy.
 *
 * Este condicional morava em `external/index.ts`. Desceu para cá porque seleção de controller é
 * assunto de controller — e porque, com todo contexto expondo o mesmo símbolo montado, o gerador da
 * composição não precisa de um ramo para os três casos especiais.
 */
export default Config.env.EMIT_OPENAPI === 'true' ? ({} as Record<string, never>) : { ChannelProxy }
