import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CompleteOnboardingMutationResponse } from "../../../types/CompleteOnboarding.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Conclui o onboarding do operador — grava completedAt
 * {@link /v1/ui/onboarding/complete}
 */
export async function completeOnboardingHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<CompleteOnboardingMutationResponse, ResponseErrorConfig<Error>, unknown>({ method : "POST", url : `/v1/ui/onboarding/complete` })
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