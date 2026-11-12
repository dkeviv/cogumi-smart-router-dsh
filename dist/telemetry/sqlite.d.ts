import { TelemetryEvent } from '../types/index.js';
export interface TelemetryStoreConfig {
    dbPath?: string;
    retentionDays?: number;
}
export declare class TelemetryStore {
    private db;
    private retentionDays;
    private dbPath;
    private initialized;
    constructor(config?: TelemetryStoreConfig);
    initialize(): Promise<void>;
    private initSchema;
    private createIndexes;
    private persist;
    record(event: TelemetryEvent): Promise<void>;
    listTelemetry(options?: {
        limit?: number;
        sessionId?: string;
    }): Promise<TelemetryEvent[]>;
    getSessionPin(sessionId: string): Promise<{
        pinnedModelId: string;
        pinnedProvider: string;
        pinReason: string;
        pinnedAt: number;
        hasEverSwitched: boolean;
        consecutiveUpstreamErrors: number;
    } | null>;
    setSessionPin(sessionId: string, pin: {
        pinnedModelId: string;
        pinnedProvider: string;
        pinReason: string;
        hasEverSwitched: boolean;
        consecutiveUpstreamErrors: number;
    }): Promise<void>;
    breakPin(sessionId: string): Promise<void>;
    incrementUpstreamErrors(sessionId: string): Promise<number>;
    resetUpstreamErrors(sessionId: string): Promise<void>;
    getFleetMode(): Promise<{
        mode: 'scoped' | 'all';
        updatedAt: number;
    } | null>;
    setFleetMode(mode: 'scoped' | 'all'): Promise<void>;
    recordPrice(modelId: string, provider: string, costPer1MInput: number, costPer1MOutput: number): Promise<void>;
    getPriceCatalog(): Promise<Map<string, {
        provider: string;
        input: number;
        output: number;
        lastUpdated: number;
    }>>;
    cleanupOldEvents(): Promise<number>;
    private ensureInitialized;
    close(): void;
}
export declare function createTelemetryStore(config?: TelemetryStoreConfig): TelemetryStore;
//# sourceMappingURL=sqlite.d.ts.map