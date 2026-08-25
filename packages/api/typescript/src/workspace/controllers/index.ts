export { AddWorkspaceController } from './AddWorkspace'
export { RemoveWorkspaceController } from './RemoveWorkspace'
export { ListWorkspacesController } from './ListWorkspaces'

import { AddWorkspaceController } from './AddWorkspace'
import { RemoveWorkspaceController } from './RemoveWorkspace'
import { ListWorkspacesController } from './ListWorkspaces'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default { AddWorkspaceController, RemoveWorkspaceController, ListWorkspacesController }
