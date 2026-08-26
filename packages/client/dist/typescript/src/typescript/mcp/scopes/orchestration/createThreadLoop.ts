import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CreateThreadLoopMutationRequest, CreateThreadLoopMutationResponse, CreateThreadLoopPathParams } from "../../../types/CreateThreadLoop.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Schedule a recurring whisper into this conversation (C21)
 * {@link /threads/:threadId/loops}
 */
export async function createThreadLoopHandler({ threadId, data }: { threadId: CreateThreadLoopPathParams["threadId"]; data: CreateThreadLoopMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<CreateThreadLoopMutationResponse, ResponseErrorConfig<Error>, CreateThreadLoopMutationRequest>({ method : "POST", url : `/threads/${threadId}/loops`, data : requestData })
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