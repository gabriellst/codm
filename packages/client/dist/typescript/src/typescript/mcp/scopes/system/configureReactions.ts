import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { ConfigureReactionsMutationRequest, ConfigureReactionsMutationResponse, ConfigureReactionsPathParams } from "../../../types/ConfigureReactions.ts";

/**
 * @description Turn the 👀/🤖 channel reaction cues on or off for this conversation
 * {@link /threads/:threadId/reactions}
 */
export async function configureReactionsHandler({ threadId, data }: { threadId: ConfigureReactionsPathParams["threadId"]; data: ConfigureReactionsMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureReactionsMutationResponse, ResponseErrorConfig<Error>, ConfigureReactionsMutationRequest>({ method : "PUT", url : `/threads/${threadId}/reactions`, data : requestData })
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