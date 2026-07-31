import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ConfigurePromptMutationRequest, ConfigurePromptMutationResponse, ConfigurePromptPathParams } from "../../../types/ConfigurePrompt.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Set (or clear, with an empty body value) the operator's custom prompt for this conversation (C15)
 * {@link /v1/threads/:threadId/prompt}
 */
export async function configurePromptHandler({ threadId, data }: { threadId: ConfigurePromptPathParams["threadId"]; data?: ConfigurePromptMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigurePromptMutationResponse, ResponseErrorConfig<Error>, ConfigurePromptMutationRequest>({ method : "PUT", url : `/v1/threads/${threadId}/prompt`, data : requestData })
  return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res.data)
                }
              ],
              structuredContent: { data: res.data }
             }
}