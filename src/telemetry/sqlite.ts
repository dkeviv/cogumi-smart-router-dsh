// src/telemetry/sqlite.ts
// SQLite telemetry store for routing events (using sql.js - pure JS WASM)

import {
  TelemetryEvent,
  SessionStatsSnapshot,
  PlacementPlanReport,
} from '../types';
import initSqlJs, { Database } from 'sql.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

export interface TelemetryStoreConfig {
  dbPath?: string;
  retentionDays?: number;
}

export class TelemetryStore {
  private db: Database | null = null;
  private retentionDays: number;
  private dbPath: string;
  private initialized = false;

  constructor(config: TelemetryStoreConfig = {}) {
    this.retentionDays = config.retentionDays || 30;

    // Default to .dsh-smart-router in user's home directory
    this.dbPath = config.dbPath || join(homedir(), '.dsh-smart-router', 'state.db');
    const dbDir = join(this.dbPath, '..');
    mkdirSync(dbDir, { recursive: true });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const SQL = await initSqlJs({
      locateFile: (file) => `https://sql.js.org/dist/${file}`,
    });

    // Load existing database or create new
    let db: Database;
    if (existsSync(this.dbPath)) {
      const filebuffer = readFileSync(this.dbPath);
      db = new SQL.Database(filebuffer);
    } else {
      db = new SQL.Database();
    }

    this.db = db;
    this.initSchema();
    this.createIndexes();
    this.initialized = true;
  }

  private initSchema(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS routing_events (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        tier TEXT NOT NULL,
        stage TEXT NOT NULL,
        reason_code TEXT,
        reasoning TEXT,
        cost REAL,
        latency_ms INTEGER,
        session_pinned BOOLEAN,
        fallback_chain TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        planning_delegate_primary_model_id TEXT,
        planning_delegate_model_id TEXT,
        turn_type TEXT
      );

      CREATE TABLE IF NOT EXISTS session_pins (
        session_id TEXT PRIMARY KEY,
        pinned_model_id TEXT NOT NULL,
        pinned_provider TEXT NOT NULL,
        pin_reason TEXT,
        pinned_at INTEGER NOT NULL,
        has_ever_switched BOOLEAN DEFAULT 0,
        consecutive_upstream_errors INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS fleet_mode (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        mode TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS price_catalog (
        model_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        cost_per_1m_input REAL,
        cost_per_1m_output REAL,
        last_updated INTEGER NOT NULL
      );
    `);
  }

  private createIndexes(): void {
    if (!this.db) return;

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_routing_session ON routing_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_routing_timestamp ON routing_events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_routing_model ON routing_events(model);
      CREATE INDEX IF NOT EXISTS idx_routing_tier ON routing_events(tier);
    `);
  }

  private persist(): void {
    if (!this.db) return;
    const data = this.db.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  async record(event: TelemetryEvent): Promise<void> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO routing_events (
        id, timestamp, session_id, turn_id, provider, model, tier,
        stage, reason_code, reasoning, cost, latency_ms, session_pinned,
        fallback_chain, input_tokens, output_tokens,
        planning_delegate_primary_model_id, planning_delegate_model_id, turn_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run([
      event.id,
      event.timestamp,
      event.sessionId,
      event.turnId,
      event.provider,
      event.model,
      event.tier,
      event.stage,
      event.reasonCode,
      event.reasoning,
      event.cost,
      event.latencyMs,
      event.sessionPinned ? 1 : 0,
      JSON.stringify(event.fallbackChain),
      event.inputTokens,
      event.outputTokens,
      event.planningDelegatePrimaryModelId || null,
      event.planningDelegateModelId || null,
      event.turnType,
    ]);

    stmt.free();
    this.persist();
  }

  async listTelemetry(options: { limit?: number; sessionId?: string } = {}): Promise<TelemetryEvent[]> {
    await this.ensureInitialized();

    const limit = options.limit || 50;
    let query = 'SELECT * FROM routing_events';
    const params: unknown[] = [];

    if (options.sessionId) {
      query += ' WHERE session_id = ?';
      params.push(options.sessionId);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db!.prepare(query);
    stmt.bind(params as any);
    const rows: any[] = [];

    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      sessionId: row.session_id,
      turnId: row.turn_id,
      provider: row.provider,
      model: row.model,
      tier: row.tier,
      stage: row.stage,
      reasonCode: row.reason_code,
      reasoning: row.reasoning,
      cost: row.cost,
      latencyMs: row.latency_ms,
      sessionPinned: Boolean(row.session_pinned),
      fallbackChain: JSON.parse(row.fallback_chain || '[]'),
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      planningDelegatePrimaryModelId: row.planning_delegate_primary_model_id,
      planningDelegateModelId: row.planning_delegate_model_id,
      turnType: row.turn_type,
    }));
  }

  async getSessionPin(sessionId: string): Promise<{
    pinnedModelId: string;
    pinnedProvider: string;
    pinReason: string;
    pinnedAt: number;
    hasEverSwitched: boolean;
    consecutiveUpstreamErrors: number;
  } | null> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare('SELECT * FROM session_pins WHERE session_id = ?');
    stmt.bind([sessionId]);

    let result: any = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();

    if (!result) return null;

    return {
      pinnedModelId: result.pinned_model_id,
      pinnedProvider: result.pinned_provider,
      pinReason: result.pin_reason,
      pinnedAt: result.pinned_at,
      hasEverSwitched: Boolean(result.has_ever_switched),
      consecutiveUpstreamErrors: result.consecutive_upstream_errors,
    };
  }

  async setSessionPin(
    sessionId: string,
    pin: {
      pinnedModelId: string;
      pinnedProvider: string;
      pinReason: string;
      hasEverSwitched: boolean;
      consecutiveUpstreamErrors: number;
    }
  ): Promise<void> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO session_pins (session_id, pinned_model_id, pinned_provider, pin_reason, pinned_at, has_ever_switched, consecutive_upstream_errors)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        pinned_model_id = excluded.pinned_model_id,
        pinned_provider = excluded.pinned_provider,
        pin_reason = excluded.pin_reason,
        has_ever_switched = excluded.has_ever_switched,
        consecutive_upstream_errors = excluded.consecutive_upstream_errors
    `);

    stmt.run([
      sessionId,
      pin.pinnedModelId,
      pin.pinnedProvider,
      pin.pinReason,
      Date.now(),
      pin.hasEverSwitched ? 1 : 0,
      pin.consecutiveUpstreamErrors,
    ]);

    stmt.free();
    this.persist();
  }

  async breakPin(sessionId: string): Promise<void> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare('DELETE FROM session_pins WHERE session_id = ?');
    stmt.run([sessionId]);
    stmt.free();
    this.persist();
  }

  async incrementUpstreamErrors(sessionId: string): Promise<number> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      UPDATE session_pins SET consecutive_upstream_errors = consecutive_upstream_errors + 1
      WHERE session_id = ?
    `);
    stmt.run([sessionId]);
    const changes = this.db!.getRowsModified();
    stmt.free();

    if (changes > 0) {
      // Get the new value
      const selectStmt = this.db!.prepare('SELECT consecutive_upstream_errors FROM session_pins WHERE session_id = ?');
      selectStmt.bind([sessionId]);
      let value = 0;
      if (selectStmt.step()) {
        const row = selectStmt.get();
        value = row[0] as number;
      }
      selectStmt.free();
      this.persist();
      return value;
    }

    this.persist();
    return 0;
  }

  async resetUpstreamErrors(sessionId: string): Promise<void> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      UPDATE session_pins SET consecutive_upstream_errors = 0 WHERE session_id = ?
    `);
    stmt.run([sessionId]);
    stmt.free();
    this.persist();
  }

  async getFleetMode(): Promise<{ mode: 'scoped' | 'all'; updatedAt: number } | null> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare('SELECT mode, updated_at FROM fleet_mode WHERE id = 1');
    let result: any = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();

    if (!result) return null;
    return { mode: result.mode, updatedAt: result.updated_at };
  }

  async setFleetMode(mode: 'scoped' | 'all'): Promise<void> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO fleet_mode (id, mode, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at
    `);
    stmt.run([mode, Date.now()]);
    stmt.free();
    this.persist();
  }

  async recordPrice(
    modelId: string,
    provider: string,
    costPer1MInput: number,
    costPer1MOutput: number
  ): Promise<void> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare(`
      INSERT INTO price_catalog (model_id, provider, cost_per_1m_input, cost_per_1m_output, last_updated)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(model_id) DO UPDATE SET
        provider = excluded.provider,
        cost_per_1m_input = excluded.cost_per_1m_input,
        cost_per_1m_output = excluded.cost_per_1m_output,
        last_updated = excluded.last_updated
    `);
    stmt.run([modelId, provider, costPer1MInput, costPer1MOutput, Date.now()]);
    stmt.free();
    this.persist();
  }

  async getPriceCatalog(): Promise<Map<string, { provider: string; input: number; output: number; lastUpdated: number }>> {
    await this.ensureInitialized();

    const stmt = this.db!.prepare('SELECT * FROM price_catalog');
    const catalog = new Map();

    while (stmt.step()) {
      const row = stmt.getAsObject();
      catalog.set(row.model_id, {
        provider: row.provider,
        input: row.cost_per_1m_input,
        output: row.cost_per_1m_output,
        lastUpdated: row.last_updated,
      });
    }
    stmt.free();

    return catalog;
  }

  async cleanupOldEvents(): Promise<number> {
    await this.ensureInitialized();

    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const stmt = this.db!.prepare('DELETE FROM routing_events WHERE timestamp < ?');
    stmt.run([cutoff]);
    const changes = this.db!.getRowsModified();
    stmt.free();
    this.persist();
    return changes;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  close(): void {
    if (this.db) {
      this.persist();
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

export function createTelemetryStore(config?: TelemetryStoreConfig): TelemetryStore {
  return new TelemetryStore(config);
}