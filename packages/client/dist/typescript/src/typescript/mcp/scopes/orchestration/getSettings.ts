import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetSettingsQueryResponse } from "../../../types/GetSettings.ts";

/**
 * @description Settings — providers, stop criteria, general, app version (T08)
 * {@link /ui/settings}
 */
export async function getSettingsHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetSettingsQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/ui/settings` })
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