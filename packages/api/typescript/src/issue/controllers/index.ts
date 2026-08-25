export { ArchiveIssueController } from './ArchiveIssue'
export { GetIssueDetailController } from './GetIssueDetail'
export { GetIssueStatusController } from './GetIssueStatus'
export { GetIssuesOverviewController } from './GetIssuesOverview'
export { GetSessionIssuesController } from './GetSessionIssues'
export { RestoreIssueController } from './RestoreIssue'
export { SteerIssueController } from './SteerIssue'

import { ArchiveIssueController } from './ArchiveIssue'
import { GetIssueDetailController } from './GetIssueDetail'
import { GetIssueStatusController } from './GetIssueStatus'
import { GetIssuesOverviewController } from './GetIssuesOverview'
import { GetSessionIssuesController } from './GetSessionIssues'
import { RestoreIssueController } from './RestoreIssue'
import { SteerIssueController } from './SteerIssue'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default {
	ArchiveIssueController,
	GetIssueDetailController,
	GetIssueStatusController,
	GetIssuesOverviewController,
	GetSessionIssuesController,
	RestoreIssueController,
	SteerIssueController,
}
