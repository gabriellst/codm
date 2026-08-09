// packages/app/react/src/routes/onboarding/-components/system-preconditions.ts — COMPLETE final file
import type { SystemPreconditionId } from '@/services'
import { FullDiskAccessCard } from './FullDiskAccessCard'
import type { SystemPreconditionModule } from './SystemPreconditionList'

/**
 * O REGISTRO DO CONSOLE — o par do registro do host (`src-tauri/src/system_preconditions/mod.rs`), unido a
 * ele pelo union de ids que as bindings do tauri-specta congelam.
 *
 * `Record<SystemPreconditionId, …>` e não `Partial`: um id sem componente é erro de `tsc`, não um cartão
 * que some em runtime (spec Decision 3 / canon CMP-P18). Somar uma pré-condição = um arquivo de
 * cartão + uma linha aqui, sem tocar na lista, no slide ou no gate.
 */
export const SYSTEM_PRECONDITION_MODULES: Record<SystemPreconditionId, SystemPreconditionModule<SystemPreconditionId>> = {
	FULL_DISK_ACCESS: { id: 'FULL_DISK_ACCESS', Component: FullDiskAccessCard },
}
