export { GetArtifactContentController } from './GetArtifactContent'
export { ListArtifactsController } from './ListArtifacts'
export { RecordArtifactController } from './RecordArtifact'
export { SendArtifactController } from './SendArtifact'

import { GetArtifactContentController } from './GetArtifactContent'
import { ListArtifactsController } from './ListArtifacts'
import { RecordArtifactController } from './RecordArtifact'
import { SendArtifactController } from './SendArtifact'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default { GetArtifactContentController, ListArtifactsController, RecordArtifactController, SendArtifactController }
