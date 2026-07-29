import fetch from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetNeedsYouPanelQueryResponse, GetNeedsYouPanelPathParams } from "../../../types/GetNeedsYouPanel.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Active stops on a thread with per-kind resolution actions (T14)
 * {@link /v1/threads/:threadId/needs-you}
 */
export async function getNeedsYouPanelHandler({ threadId }: { threadId: GetNeedsYouPanelPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetNeedsYouPanelQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/threads/${threadId}/needs-you` })
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