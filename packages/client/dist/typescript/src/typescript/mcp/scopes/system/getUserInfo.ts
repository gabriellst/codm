import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetUserInfoQueryResponse } from "../../../types/GetUserInfo.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Header context — user identity, all member owners (role), active owner, and profile alerts
 * {@link /ui/user-info}
 */
export async function getUserInfoHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetUserInfoQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/ui/user-info` })
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