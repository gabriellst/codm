// AUTO-GENERATED — do not edit. MCP scope 'orchestration' of the 'typescript' service.
//
// THE ONLY AUTH SEAM a generated tool has: the handlers take no config parameter, so this module is
// the single place a run token can be attached. It THROWS outside a router-established context rather
// than degrading to an anonymous request the daemon would serve with full operator authority.
import { createClient } from '../../../../http'
import { requireMcpRunContext, MCP_RUN_TOKEN_HEADER } from '../../context'
import type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig } from '../../../../http'

const core = createClient('typescript')

const client = async <TData, TError = unknown, TVariables = unknown>(
	config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> => {
	// ONE read: token and origin come from the SAME established context, so a handler can never end up
	// authenticated against one daemon and addressed at another.
	const run = requireMcpRunContext()
	return core<TData, TError, TVariables>({
		...config,
		baseURL: run.baseUrl,
		headers: { ...(config.headers as Record<string, string> | undefined), [MCP_RUN_TOKEN_HEADER]: run.token },
	})
}

export default client
export type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig }
