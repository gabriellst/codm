import fetch from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetThreadSettingsQueryResponse, GetThreadSettingsPathParams } from "../../../types/GetThreadSettings.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Per-thread behavior: mention gate, participants + invocation, buffer size (T10)
 * {@link /v1/threads/:threadId/settings}
 */
export async function getThreadSettingsHandler({ threadId }: { threadId: GetThreadSettingsPathParams["threadId"] }): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetThreadSettingsQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/threads/${threadId}/settings` })
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