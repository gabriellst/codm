import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetSessionChatQueryResponse, GetSessionChatPathParams } from "../../../types/GetSessionChat.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Full thread conversation + control-plane state + active stops (T09)
 * {@link /v1/threads/:threadId/chat}
 */
export async function getSessionChatHandler({ threadId }: { threadId: GetSessionChatPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetSessionChatQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/threads/${threadId}/chat` })
  return {
              content: [
                {
                  type: 'text',
                  text: res.data === undefined ? 'OK' : JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}