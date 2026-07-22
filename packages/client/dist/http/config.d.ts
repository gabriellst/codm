export interface ClientConfig {
    baseUrl: string;
}
export declare function createConfigManager(symbolKey: symbol): {
    configureClient: (newConfig: Partial<ClientConfig>) => void;
    getConfig: () => Readonly<ClientConfig>;
    resetConfig: () => void;
    resolveURL: (url: string) => string;
};
