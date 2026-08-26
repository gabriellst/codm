import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { DeleteThreadLoopMutationResponse, DeleteThreadLoopPathParams } from "../../../types/DeleteThreadLoop.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Remove a loop (C24)
 * {@link /threads/:threadId/loops/:loopId}
 */
export async function deleteThreadLoopHandler({ threadId, loopId }: { threadId: DeleteThreadLoopPathParams["threadId"]; loopId: DeleteThreadLoopPathParams["loopId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<DeleteThreadLoopMutationResponse, ResponseErrorConfig<Error>, unknown>({ method : "DELETE", url : `/threads/${threadId}/loops/${loopId}` })
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