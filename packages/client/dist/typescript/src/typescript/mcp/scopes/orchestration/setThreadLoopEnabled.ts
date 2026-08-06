import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { SetThreadLoopEnabledMutationRequest, SetThreadLoopEnabledMutationResponse, SetThreadLoopEnabledPathParams } from "../../../types/SetThreadLoopEnabled.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Pause or resume a loop (C23)
 * {@link /v1/threads/:threadId/loops/:loopId/enabled}
 */
export async function setThreadLoopEnabledHandler({ threadId, loopId, data }: { threadId: SetThreadLoopEnabledPathParams["threadId"]; loopId: SetThreadLoopEnabledPathParams["loopId"]; data: SetThreadLoopEnabledMutationRequest }): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<SetThreadLoopEnabledMutationResponse, ResponseErrorConfig<Error>, SetThreadLoopEnabledMutationRequest>({ method : "PUT", url : `/v1/threads/${threadId}/loops/${loopId}/enabled`, data : requestData })
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