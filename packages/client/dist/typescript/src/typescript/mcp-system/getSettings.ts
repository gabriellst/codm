import fetch from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { GetSettingsQueryResponse } from "../types/GetSettings.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp-system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Settings — providers, stop criteria, general, app version (T08)
 * {@link /v1/ui/settings}
 */
export async function getSettingsHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetSettingsQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/ui/settings` })
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