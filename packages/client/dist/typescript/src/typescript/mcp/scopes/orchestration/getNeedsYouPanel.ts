import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetNeedsYouPanelQueryResponse, GetNeedsYouPanelPathParams } from "../../../types/GetNeedsYouPanel.ts";

/**
 * @description Active stops on a thread with per-kind resolution actions (T14)
 * {@link /threads/:threadId/needs-you}
 */
export async function getNeedsYouPanelHandler({ threadId }: { threadId: GetNeedsYouPanelPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetNeedsYouPanelQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/threads/${threadId}/needs-you` })
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