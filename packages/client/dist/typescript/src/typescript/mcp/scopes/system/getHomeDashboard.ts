import fetch from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetHomeDashboardQueryResponse } from "../../../types/GetHomeDashboard.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Home dashboard — agents running, needs-you, active sessions, today metrics, channels (T03)
 * {@link /v1/ui/home}
 */
export async function getHomeDashboardHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetHomeDashboardQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/ui/home` })
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