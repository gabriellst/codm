import fetch from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { ReportProgressMutationRequest, ReportProgressMutationResponse, ReportProgressPathParams } from "../../../types/ReportProgress.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/issue-handling/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Record what you did on this task — it goes to the task's timeline, not to the group.
 * {@link /threads/:threadId/issues/:issueId/progress}
 */
export async function reportProgressHandler({ threadId, issueId, data }: { threadId: ReportProgressPathParams["threadId"]; issueId: ReportProgressPathParams["issueId"]; data: ReportProgressMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ReportProgressMutationResponse, ResponseErrorConfig<Error>, ReportProgressMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues/${issueId}/progress`, data : requestData })
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