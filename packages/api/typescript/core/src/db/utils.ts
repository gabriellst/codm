export const enumValues = <E extends Record<string, string>>(e: E) => Object.values(e) as [E[keyof E], ...E[keyof E][]]
