import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ConfigureOutputModeMutationRequest, ConfigureOutputModeMutationResponse, ConfigureOutputModePathParams } from "../../../types/ConfigureOutputMode.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Choose how much of its tasks' output this conversation's group receives
 * {@link /threads/:threadId/output-mode}
 */
export async function configureOutputModeHandler({ threadId, data }: { threadId: ConfigureOutputModePathParams["threadId"]; data: ConfigureOutputModeMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureOutputModeMutationResponse, ResponseErrorConfig<Error>, ConfigureOutputModeMutationRequest>({ method : "PUT", url : `/threads/${threadId}/output-mode`, data : requestData })
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