/**
 * Type for refinement metadata extracted from Zod schemas
 */
export interface RefinementMetadata {
	function: string
	error?: string
	path?: (string | number)[]
}

/**
 * HttpRequest properties that can be filtered
 */
const HTTP_REQUEST_PROPERTIES = ['body', 'query', 'headers', 'params', 'cookie', 'ctx'] as const

/**
 * Extracts all HttpRequest property accesses from a function string.
 * Handles multiple access patterns:
 * - Standard dot notation: data.body.field
 * - Optional chaining: data?.body?.field
 * - Bracket notation: data['body'].field or data["body"].field
 *
 * @param fnString - The function string to analyze
 * @returns Set of HttpRequest property names accessed
 */
function extractAccessedProperties(fnString: string): Set<string> {
	const accessedProperties = new Set<string>()

	// Match standard dot notation: param.property. (e.g., data.body.)
	const dotMatches = fnString.match(/\b(\w+)\.(\w+)\./g)
	if (dotMatches) {
		for (const match of dotMatches) {
			const parts = match.split('.')
			const prop = parts[1]
			if (prop && HTTP_REQUEST_PROPERTIES.includes(prop as (typeof HTTP_REQUEST_PROPERTIES)[number])) {
				accessedProperties.add(prop)
			}
		}
	}

	// Match optional chaining: param?.property (e.g., data?.body)
	const optionalMatches = fnString.match(/\b(\w+)\?\.(body|query|headers|params|cookie|ctx)\b/g)
	if (optionalMatches) {
		for (const match of optionalMatches) {
			const parts = match.split('?.')
			const prop = parts[1]
			if (prop) {
				accessedProperties.add(prop)
			}
		}
	}

	// Match bracket notation with single quotes: param['property'] (e.g., data['body'])
	const bracketSingleMatches = fnString.match(/\b(\w+)\['(body|query|headers|params|cookie|ctx)'\]/g)
	if (bracketSingleMatches) {
		for (const match of bracketSingleMatches) {
			const propMatch = match.match(/\['(\w+)'\]/)
			if (propMatch?.[1]) {
				accessedProperties.add(propMatch[1])
			}
		}
	}

	// Match bracket notation with double quotes: param["property"] (e.g., data["body"])
	const bracketDoubleMatches = fnString.match(/\b(\w+)\["(body|query|headers|params|cookie|ctx)"\]/g)
	if (bracketDoubleMatches) {
		for (const match of bracketDoubleMatches) {
			const propMatch = match.match(/\["(\w+)"\]/)
			if (propMatch?.[1]) {
				accessedProperties.add(propMatch[1])
			}
		}
	}

	return accessedProperties
}

/**
 * Checks if a function string accesses a specific property using any notation.
 *
 * @param fnString - The function string to check
 * @param propertyName - The property to look for
 * @returns True if the property is accessed
 */
function accessesProperty(fnString: string, propertyName: string): boolean {
	// Check dot notation: param.property or param.property.
	if (new RegExp(`\\b\\w+\\.${propertyName}\\b`).test(fnString)) {
		return true
	}

	// Check optional chaining: param?.property
	if (new RegExp(`\\b\\w+\\?\\.${propertyName}\\b`).test(fnString)) {
		return true
	}

	// Check bracket notation with single quotes: param['property']
	if (new RegExp(`\\b\\w+\\['${propertyName}'\\]`).test(fnString)) {
		return true
	}

	// Check bracket notation with double quotes: param["property"]
	if (new RegExp(`\\b\\w+\\["${propertyName}"\\]`).test(fnString)) {
		return true
	}

	return false
}

/**
 * Filters refinements to only include those that reference a specific property path
 * of the HttpRequest (e.g., 'body', 'query', 'headers', 'params', 'cookie', 'ctx').
 *
 * A refinement is included only if ALL its parameter property references are to the specified property.
 * This prevents cross-property refinements (e.g., req.body.x !== req.query.y) from
 * being incorrectly included in a single property's schema.
 *
 * Handles various parameter patterns:
 * - Named parameters: `data`, `req`, `input`, `ctx`, `request`, etc.
 * - Standard dot notation: `data.body.field`
 * - Optional chaining: `data?.body?.field`
 * - Bracket notation: `data['body'].field` or `data["body"].field`
 * - Destructured parameters are skipped (too complex to transform safely)
 *
 * @param refinements - Array of refinement metadata objects
 * @param propertyName - The property to filter for (e.g., 'body', 'query', 'headers', 'params', 'cookie', 'ctx')
 * @returns Refinements that only reference the specified property
 *
 * @example
 * ```typescript
 * filterRefinementsForProperty(
 *   [{ function: "data.body.x !== data.body.y" }, { function: "req.body.x !== req.query.z" }],
 *   "body"
 * )
 * // Returns: [{ function: "data.body.x !== data.body.y" }]
 * ```
 *
 * @example
 * ```typescript
 * filterRefinementsForProperty(
 *   [{ function: "req.query.page > 0" }, { function: "req.query.page !== req.body.page" }],
 *   "query"
 * )
 * // Returns: [{ function: "req.query.page > 0" }]
 * ```
 */
export function filterRefinementsForProperty(refinements: RefinementMetadata[], propertyName: string): RefinementMetadata[] {
	return refinements.filter(refinement => {
		const fnString = refinement.function

		// Skip destructured parameters in function signature - they're too complex to transform safely
		// e.g., ({ body }) => ..., ({ query, headers }) => ...
		if (fnString.includes('({')) {
			return false
		}

		// Extract all HttpRequest property accesses using all notation styles
		const allAccessedProperties = extractAccessedProperties(fnString)

		// If the function accesses multiple different HttpRequest properties (cross-property comparison),
		// exclude it even if one of them is the target property
		// e.g., data.body.x !== data.query.y should be excluded when filtering for 'body'
		if (allAccessedProperties.size > 1) {
			return false
		}

		// If refinement has a path, it's operating on a nested property
		// Since we're filtering for a specific property (body, query, headers, etc.), any refinement
		// with a path is likely operating on that property's nested fields
		// e.g., body.holder.document, query.page, headers.authorization, params.id, etc.
		// The path tells us which nested property it validates
		if (refinement.path && Array.isArray(refinement.path) && refinement.path.length > 0) {
			// Check if the function accesses the target property using any notation
			if (accessesProperty(fnString, propertyName)) {
				return true
			}
		}

		// Check if refinement uses destructuring inside the function body
		// e.g., const { body } = data, const { query } = req, const { headers } = request
		const hasDestructuring = fnString.includes('const {') || fnString.includes('let {') || fnString.includes('var {')

		if (hasDestructuring) {
			// Try to find destructuring of the target property
			// Match: const { body } = data, const { query } = req, const { headers } = request, etc.
			const destructurePattern = new RegExp(`(?:const|let|var)\\s*\\{\\s*${propertyName}\\s*\\}\\s*=\\s*\\w+`, 'g')
			if (destructurePattern.test(fnString)) {
				// This refinement destructures the target property, include it
				return true
			}

			return false
		}

		// Check for direct property access (any notation) without nested fields detected
		if (allAccessedProperties.size === 0) {
			// Try direct property access check
			if (accessesProperty(fnString, propertyName)) {
				return true
			}
			// No property access patterns found, skip this refinement
			return false
		}

		// Check if the refinement accesses the target property
		return allAccessedProperties.has(propertyName)
	})
}
