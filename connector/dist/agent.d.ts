type StorageMode = 'relay' | 'local' | 'cloud';
interface AgentOptions {
    userId: string;
    agentName: string;
    systemPrompt: string;
    apiKey: string;
    storageMode: StorageMode;
    notionToken?: string;
    notionPageId?: string;
    higgsfieldKey?: string;
    higgsfieldSecret?: string;
    manusKey?: string;
}
export declare function runAgent({ userId, agentName, systemPrompt, apiKey, storageMode, notionToken, notionPageId, higgsfieldKey, higgsfieldSecret, manusKey }: AgentOptions): Promise<void>;
export {};
//# sourceMappingURL=agent.d.ts.map