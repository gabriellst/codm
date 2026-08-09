// packages/app/react/src/routes/onboarding/-components/preconditions.ts — COMPLETE final file
import type { PreconditionId } from '@/services'
import { FullDiskAccessCard } from './FullDiskAccessCard'
import type { PreconditionModule } from './PreconditionList'

/**
 * O REGISTRO DO CONSOLE — o par do registro do host (`src-tauri/src/preconditions/mod.rs`), unido a
 * ele pelo union de ids que as bindings do tauri-specta congelam.
 *
 * `Record<PreconditionId, …>` e não `Partial`: um id sem componente é erro de `tsc`, não um cartão
 * que some em runtime (spec Decision 3 / canon CMP-P18). Somar uma pré-condição = um arquivo de
 * cartão + uma linha aqui, sem tocar na lista, no slide ou no gate.
 */
export const PRECONDITION_MODULES: Record<PreconditionId, PreconditionModule<PreconditionId>> = {
	FULL_DISK_ACCESS: { id: 'FULL_DISK_ACCESS', Component: FullDiskAccessCard },
}
