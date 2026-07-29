import fetch from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetMyAccountQueryResponse } from "../../../types/GetMyAccount.ts";
import type { ResponseErrorConfig } from "@codedm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Account settings read
 * {@link /v1/ui/account}
 */
export async function getMyAccountHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetMyAccountQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/ui/account` })
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