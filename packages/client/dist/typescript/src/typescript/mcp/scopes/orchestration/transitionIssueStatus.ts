import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { TransitionIssueStatusMutationRequest, TransitionIssueStatusMutationResponse, TransitionIssueStatusPathParams } from "../../../types/TransitionIssueStatus.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Declare the lifecycle status of an issue (done / needs input)
 * {@link /threads/:threadId/issues/:issueId/status}
 */
export async function transitionIssueStatusHandler({ threadId, issueId, data }: { threadId: TransitionIssueStatusPathParams["threadId"]; issueId: TransitionIssueStatusPathParams["issueId"]; data: TransitionIssueStatusMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<TransitionIssueStatusMutationResponse, ResponseErrorConfig<Error>, TransitionIssueStatusMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/status`, data : requestData })
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