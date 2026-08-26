/**
 * Os JOBS repetíveis deste contexto — barril mecânico. Cadência no próprio job (`static repeat`).
 *
 * C28 — a varredura de auto-arquivamento. A JANELA (24h no `WINDOW_MS`) e a CADÊNCIA (de hora em
 * hora, no `static repeat`) são grandezas diferentes e vivem lado a lado na classe.
 */
export { AutoArchiveCompletedIssues } from './usecases/AutoArchiveCompletedIssues'
