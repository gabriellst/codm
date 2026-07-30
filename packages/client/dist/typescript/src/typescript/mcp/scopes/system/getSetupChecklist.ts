import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetSetupChecklistQueryResponse } from "../../../types/GetSetupChecklist.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Onboarding checklist — channel/workspace/thread done flags (cross-context)
 * {@link /v1/ui/setup-checklist}
 */
export async function getSetupChecklistHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetSetupChecklistQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/ui/setup-checklist` })
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