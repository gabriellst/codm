import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ListArtifactsQueryResponse, ListArtifactsPathParams } from "../../../types/ListArtifacts.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description The non-code outputs of a thread (T13)
 * {@link /threads/:threadId/artifacts}
 */
export async function listArtifactsHandler({ threadId }: { threadId: ListArtifactsPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<ListArtifactsQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/threads/${threadId}/artifacts` })
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