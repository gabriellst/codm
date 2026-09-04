import fetch from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { SendDirectMessageMutationRequest, SendDirectMessageMutationResponse, SendDirectMessagePathParams } from "../../../types/SendDirectMessage.ts";

/**
 * @description Send a direct message as the operator (only while paused) (C20)
 * {@link /threads/:threadId/direct}
 */
export async function sendDirectMessageHandler({ threadId, data }: { threadId: SendDirectMessagePathParams["threadId"]; data: SendDirectMessageMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<SendDirectMessageMutationResponse, ResponseErrorConfig<Error>, SendDirectMessageMutationRequest>({ method : "POST", url : `/threads/${threadId}/direct`, data : requestData })
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