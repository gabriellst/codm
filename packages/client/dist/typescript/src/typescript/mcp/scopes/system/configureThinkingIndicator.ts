import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ConfigureThinkingIndicatorMutationRequest, ConfigureThinkingIndicatorMutationResponse, ConfigureThinkingIndicatorPathParams } from "../../../types/ConfigureThinkingIndicator.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Turn the "Pensando" channel placeholder on or off for this conversation
 * {@link /threads/:threadId/thinking-indicator}
 */
export async function configureThinkingIndicatorHandler({ threadId, data }: { threadId: ConfigureThinkingIndicatorPathParams["threadId"]; data: ConfigureThinkingIndicatorMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureThinkingIndicatorMutationResponse, ResponseErrorConfig<Error>, ConfigureThinkingIndicatorMutationRequest>({ method : "PUT", url : `/threads/${threadId}/thinking-indicator`, data : requestData })
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