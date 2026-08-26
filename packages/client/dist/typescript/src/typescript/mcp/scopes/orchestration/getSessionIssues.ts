import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { GetSessionIssuesQueryResponse, GetSessionIssuesPathParams } from "../../../types/GetSessionIssues.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Issues of one thread grouped by status + auto-archive note (T11)
 * {@link /threads/:threadId/issues}
 */
export async function getSessionIssuesHandler({ threadId }: { threadId: GetSessionIssuesPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetSessionIssuesQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/threads/${threadId}/issues` })
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