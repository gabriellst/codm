import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { RaiseStopMutationRequest, RaiseStopMutationResponse, RaiseStopPathParams } from "../../../types/RaiseStop.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Declare that the agent is blocked and needs the human (approval, classification, …)
 * {@link /v1/threads/:threadId/issues/:issueId/stops}
 */
export async function raiseStopHandler({ threadId, issueId, data }: { threadId: RaiseStopPathParams["threadId"]; issueId: RaiseStopPathParams["issueId"]; data: RaiseStopMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<RaiseStopMutationResponse, ResponseErrorConfig<Error>, RaiseStopMutationRequest>({ method : "POST", url : `/v1/threads/${threadId}/issues/${issueId}/stops`, data : requestData })
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