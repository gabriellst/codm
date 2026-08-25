/**
 * Os JOBS repetíveis deste contexto — barril mecânico.
 *
 * Só a LISTA mora aqui; a cadência mora no próprio job, como `static repeat` (T1.4). Enquanto a
 * cadência morava na lista, este barril carregava uma decisão e por isso não podia ser derivado.
 */
export { PruneOutbox } from './usecases/PruneOutbox'
