import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { ConfigureMentionGateMutationRequest, ConfigureMentionGateMutationResponse, ConfigureMentionGatePathParams } from "../../../types/ConfigureMentionGate.ts";

/**
 * @description Configure the mention gate (respond only when a @tag is written) (C12)
 * {@link /threads/:threadId/mention-gate}
 */
export async function configureMentionGateHandler({ threadId, data }: { threadId: ConfigureMentionGatePathParams["threadId"]; data: ConfigureMentionGateMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureMentionGateMutationResponse, ResponseErrorConfig<Error>, ConfigureMentionGateMutationRequest>({ method : "PUT", url : `/threads/${threadId}/mention-gate`, data : requestData })
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