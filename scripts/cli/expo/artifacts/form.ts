// `bun cli form <path> <Name>` (mobile) — TanStack Form scaffolder for the
// expo workspace. Wraps the form body in `<KeyboardAware>` and renders
// errors inline with `<Text className="text-accent-danger">`, matching the
// mobile/form skill conventions.
//
// Flags:
//   --i18n=<prefix>          Required. Labels, error fallbacks, submit text.
//   --sdk=<SchemaName>       Required. SDK Zod schema used as the validator
//                             (e.g. `CreateGameBody`) — the form is
//                             validated `onChange` against this schema.
//   --in-sheets              Target `(sheets)/<path>/-components/<Name>Form/`
//                             rather than `<path>/-components/<Name>Form/`.
//   --apple-sign-in          Insert an `expo-apple-authentication`-driven
//                             Apple Sign-In handler alongside the form.
//
// Shape sourced from berzerk-club/feat/training-collaboration's real expo
// forms (CustomExerciseForm / edit-profile / claim-username): TanStack Form
// + SDK Zod schema, submit button gated by `schema.safeParse(values).success`
// per FRM-06. The canonical shell lives in
// .claude/skills/form/expo/registry.yaml `snippet.skeleton`; this assembler
// computes placeholder bindings and delegates rendering to
// `renderArtifact('form', 'expo', …)`.

import type { Generator } from '../../types'
import { renderArtifact } from '../../snippet/render'
import { requireValue } from '../util/flags'
import { toPascalCase, withSuffix } from '../util/naming'

export const formGenerator: Generator = (pos, flags) => {
	const [routePath, rawName] = pos
	if (!routePath || !rawName) {
		console.error(['form <path> <Name> --i18n=<prefix> --sdk=<SchemaName>', '    [--in-sheets]', '    [--apple-sign-in]'].join('\n'))
		process.exit(1)
	}

	const i18nPrefix = requireValue(flags, 'i18n', 'form')
	const sdkSchema = requireValue(flags, 'sdk', 'form')
	const inSheets = flags['in-sheets'] === 'true'
	const appleSignIn = flags['apple-sign-in'] === 'true'

	const folderName = withSuffix(rawName, 'Form')
	const pascal = toPascalCase(folderName)
	const inputType = `${pascal}Input`

	// Apple Sign-In bindings — empty strings when the flag is off so the
	// renderer's no-leftover-placeholder check stays clean.
	const appleImport = appleSignIn ? `\nimport * as AppleAuthentication from 'expo-apple-authentication'` : ''
	const appleHandler = appleSignIn
		? `

	const handleAppleSignIn = async () => {
		// 1) Native Apple Sign-In returns an identity token signed by Apple.
		const credential = await AppleAuthentication.signInAsync({
			requestedScopes: [
				AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
				AppleAuthentication.AppleAuthenticationScope.EMAIL,
			],
		})
		if (!credential.identityToken) throw new Error('Apple did not return an identity token')
		// 2) Hand the token to your auth helper (see packages/app/expo/lib/auth).
		// TODO: integrate with the form payload as appropriate.
	}`
		: ''
	const appleButton = appleSignIn
		? `
							<AppleAuthentication.AppleAuthenticationButton
								buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
								buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
								cornerRadius={9999}
								style={{ width: '100%', height: 52 }}
								onPress={() => void handleAppleSignIn()}
							/>`
		: ''

	// Delegate to the canonical snippet at .claude/skills/form/expo/registry.yaml.
	// Bindings: assembler computes the runtime-varying parts, the snippet owns shape.
	const content = renderArtifact('form', 'expo', {
		Pascal: pascal,
		InputType: inputType,
		Sdk: sdkSchema,
		i18nPrefix,
		appleImport,
		appleHandler,
		appleButton,
	})

	const basePath = inSheets ? `packages/app/expo/app/(sheets)/${routePath}/-components` : `packages/app/expo/app/${routePath}/-components`
	return [
		{
			filePath: `${basePath}/${pascal}/index.tsx`,
			content,
		},
	]
}
