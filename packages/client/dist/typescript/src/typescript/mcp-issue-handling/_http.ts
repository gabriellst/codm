// AUTO-GENERATED — do not edit. MCP scope 'issue-handling' of the 'typescript' service.
//
// THE ONLY AUTH SEAM a generated tool has: the handlers take no config parameter, so this module is
// the single place a run token can be attached. It THROWS outside a router-established context rather
// than degrading to an anonymous request the daemon would serve with full operator authority.
import { createClient } from '../../http'
import { requireMcpRunToken, MCP_RUN_TOKEN_HEADER } from '../../mcp-run-context'
import type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig } from '../../http'

const core = createClient('typescript')

const client = async <TData, TError = unknown, TVariables = unknown>(
	config: RequestConfig<TVariables>,
): Promise<ResponseConfig<TData>> =>
	core<TData, TError, TVariables>({
		...config,
		headers: { ...(config.headers as Record<string, string> | undefined), [MCP_RUN_TOKEN_HEADER]: requireMcpRunToken() },
	})

export default client
export type { Client, RequestConfig, ResponseConfig, ResponseErrorConfig }
