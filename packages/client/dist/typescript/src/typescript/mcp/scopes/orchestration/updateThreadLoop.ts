import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { UpdateThreadLoopMutationRequest, UpdateThreadLoopMutationResponse, UpdateThreadLoopPathParams } from "../../../types/UpdateThreadLoop.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Edit a loop — its prompt and its schedule (C22)
 * {@link /threads/:threadId/loops/:loopId}
 */
export async function updateThreadLoopHandler({ threadId, loopId, data }: { threadId: UpdateThreadLoopPathParams["threadId"]; loopId: UpdateThreadLoopPathParams["loopId"]; data: UpdateThreadLoopMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<UpdateThreadLoopMutationResponse, ResponseErrorConfig<Error>, UpdateThreadLoopMutationRequest>({ method : "PUT", url : `/threads/${threadId}/loops/${loopId}`, data : requestData })
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