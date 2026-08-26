import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CreateIssueMutationRequest, CreateIssueMutationResponse, CreateIssuePathParams } from "../../../types/CreateIssue.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Open a new issue on a thread
 * {@link /threads/:threadId/issues}
 */
export async function createIssueHandler({ threadId, data }: { threadId: CreateIssuePathParams["threadId"]; data: CreateIssueMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<CreateIssueMutationResponse, ResponseErrorConfig<Error>, CreateIssueMutationRequest>({ method : "POST", url : `/threads/${threadId}/issues`, data : requestData })
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