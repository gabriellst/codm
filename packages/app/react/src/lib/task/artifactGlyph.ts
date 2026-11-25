import { IconFile, IconLink, IconMovie, IconMusic, IconPhoto } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { ArtifactKind } from '@codm/client-typescript/typescript'

/** The glyph that stands for an artifact kind — an icon map, not a label map (labels are i18n's job).
 *  Shared by the artifact previews, the task conversation and the cloud panel. */
export const artifactGlyph: Record<ArtifactKind, Icon> = {
	IMAGE: IconPhoto,
	AUDIO: IconMusic,
	VIDEO: IconMovie,
	FILE: IconFile,
	LINK: IconLink,
}
