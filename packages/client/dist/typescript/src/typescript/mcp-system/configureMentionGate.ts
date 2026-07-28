import fetch from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { ConfigureMentionGateMutationRequest, ConfigureMentionGateMutationResponse, ConfigureMentionGatePathParams } from "../types/ConfigureMentionGate.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Configure the mention gate (respond only when a @tag is written) (C12)
 * {@link /v1/threads/:threadId/mention-gate}
 */
export async function configureMentionGateHandler({ threadId, data }: { threadId: ConfigureMentionGatePathParams["threadId"]; data: ConfigureMentionGateMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<ConfigureMentionGateMutationResponse, ResponseErrorConfig<Error>, ConfigureMentionGateMutationRequest>({ method : "PUT", url : `/v1/threads/${threadId}/mention-gate`, data : requestData })
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