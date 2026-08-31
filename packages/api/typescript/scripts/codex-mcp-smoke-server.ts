import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'

const expected = process.env.CODM_RUN_TOKEN
if (!expected) throw new Error('CODM_RUN_TOKEN is required')

const server = Bun.serve({
	port: 3031,
	async fetch(request) {
		if (request.headers.get('authorization') !== `Bearer ${expected}`) return new Response('unauthorized', { status: 401 })
		const mcp = new McpServer({ name: 'codm-codex-smoke', version: '1.0.0' })
		mcp.registerTool('ping', { description: 'Returns the fixed CODM smoke response.', inputSchema: z.object({}) }, async () => ({
			content: [{ type: 'text', text: 'CODM-MCP-PONG' }],
		}))
		const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
		await mcp.connect(transport)
		return transport.handleRequest(request)
	},
})

process.stdout.write(`codex MCP smoke listening on ${server.url}\n`)
