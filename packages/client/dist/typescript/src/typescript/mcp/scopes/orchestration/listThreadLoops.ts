import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ListThreadLoopsQueryResponse, ListThreadLoopsPathParams } from "../../../types/ListThreadLoops.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description This conversation's scheduled prompts (loops) (T11)
 * {@link /v1/threads/:threadId/loops}
 */
export async function listThreadLoopsHandler({ threadId }: { threadId: ListThreadLoopsPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<ListThreadLoopsQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/threads/${threadId}/loops` })
  return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}