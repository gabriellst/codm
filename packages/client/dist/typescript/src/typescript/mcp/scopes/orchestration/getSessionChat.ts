import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetSessionChatQueryResponse, GetSessionChatPathParams } from "../../../types/GetSessionChat.ts";

/**
 * @description Full thread conversation + control-plane state + active stops (T09)
 * {@link /threads/:threadId/chat}
 */
export async function getSessionChatHandler({ threadId }: { threadId: GetSessionChatPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetSessionChatQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/threads/${threadId}/chat` })
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