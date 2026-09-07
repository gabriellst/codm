import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { GetMyAccountQueryResponse } from "../../../types/GetMyAccount.ts";

/**
 * @description Account settings read
 * {@link /ui/account}
 */
export async function getMyAccountHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetMyAccountQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/ui/account` })
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