import fetch from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { RequestFeedbackMutationRequest, RequestFeedbackMutationResponse, RequestFeedbackPathParams } from "../../../types/RequestFeedback.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Show the group a preview to look at (one main artifact this task recorded, plus the others for the panel). Does not hold the task.
 * {@link /threads/:threadId/issues/:issueId/feedback}
 */
export async function requestFeedbackHandler({ threadId, issueId, data }: { threadId: RequestFeedbackPathParams["threadId"]; issueId: RequestFeedbackPathParams["issueId"]; data: RequestFeedbackMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<RequestFeedbackMutationResponse, ResponseErrorConfig<Error>, RequestFeedbackMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/feedback`, data : requestData })
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