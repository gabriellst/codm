// packages/app/react/src/services/PreconditionsService/PreconditionsService.ts — COMPLETE final file
/**
 * PRÉ-CONDIÇÕES PORT — o ambiente desta máquina permite que o app funcione?
 *
 * O console NÃO pode responder isso sozinho, e é essa a razão de ser uma porta em vez de uma
 * verificação num hook: quem observa é quem tem acesso. A webview não tem sistema de arquivos, não
 * tem processo próprio e não tem como tentar a leitura cujo resultado É o veredito. O host tenta;
 * o console consome.
 *
 * O CONJUNTO REPORTADO JÁ VEM FILTRADO por plataforma — cada pré-condição declara em que hosts ela
 * existe, e `statuses()` devolve só as aplicáveis a este. Por isso a UI nunca precisa perguntar em
 * que plataforma está: um host onde a pré-condição não existe simplesmente não a reporta
 * (desktop-shell bp-02 — ramifique no que a porta REPORTA, nunca no nome do host).
 *
 * Tipos puros, sem SDK de plataforma — como toda porta aqui, esta é a forma que uma implementação
 * expo/nativa futura satisfaria verbatim. `PreconditionId` é declarado à mão (e não importado das
 * bindings) pela mesma razão que `SupervisedSidecar`: a porta não conhece tauri. A implementação
 * Tauri é onde os dois se encontram, e é lá que uma divergência de nome para de compilar.
 */

/** Os ids conhecidos. Estrutura o mapa exaustivo de componentes no onboarding (spec Decision 3). */
export const PRECONDITION_IDS = ['FULL_DISK_ACCESS'] as const

export type PreconditionId = (typeof PRECONDITION_IDS)[number]

export interface PreconditionStatus {
	id: PreconditionId
	satisfied: boolean
}

export interface PreconditionsService {
	/** O estado agora (PULL). Só as pré-condições APLICÁVEIS a este host aparecem. */
	statuses(): Promise<PreconditionStatus[]>
	/**
	 * O reparo. Os passos e — sobretudo — a ORDEM deles pertencem ao host: o console pede "repare
	 * isto", não "rode tccutil e depois abra os Ajustes". Se a sequência mudar, muda no host.
	 */
	repair(id: PreconditionId): Promise<void>
}
