/**
 * Os JOBS repetíveis deste contexto — barril mecânico. Cadência no próprio job (`static repeat`).
 *
 * A varredura de loops (C25) é um JOB e não um `setInterval` pela razão que a feature inteira
 * existe: o alarme tem de sobreviver ao daemon ser fechado, e o shell de desktop o fecha toda vez
 * que o operador sai.
 */
export { FireDueLoops } from './usecases/FireDueLoops'
