import fetch from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { ResponseErrorConfig } from "@codm/client-typescript/typescript/mcp/scopes/orchestration/_http";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types";
import type { SaveOnboardingStepMutationRequest, SaveOnboardingStepMutationResponse } from "../../../types/SaveOnboardingStep.ts";

/**
 * @description Salva onde o operador parou no wizard e/ou o rascunho (contactRef/workspace/providers) acumulado até aqui
 * {@link /ui/onboarding/step}
 */
export async function saveOnboardingStepHandler({ data }: { data?: SaveOnboardingStepMutationRequest } = {}): Promise<Promise<CallToolResult>> {


  const requestData = data

  const res = await fetch<SaveOnboardingStepMutationResponse, ResponseErrorConfig<Error>, SaveOnboardingStepMutationRequest>({ method : "PATCH", url : `/ui/onboarding/step`, data : requestData })
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