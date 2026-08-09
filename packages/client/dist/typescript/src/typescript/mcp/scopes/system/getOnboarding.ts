import fetch from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { GetOnboardingQueryResponse } from "../../../types/GetOnboarding.ts";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/system/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";

/**
 * @description Onboarding — jornada persistida (currentStep/completedAt) + satisfação derivada dos passos de setup
 * {@link /v1/ui/onboarding}
 */
export async function getOnboardingHandler(): Promise<Promise<CallToolResult>> {




  const res = await fetch<GetOnboardingQueryResponse, ResponseErrorConfig<Error>, unknown>({ method : "GET", url : `/v1/ui/onboarding` })
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