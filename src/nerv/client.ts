import type { MastodonStatus } from './types';

export type ClientStatus = 'connecting' | 'connected' | 'polling' | 'error';

export type ClientOptions = {
  instance: string;
  account: string;
  onStatus: (status: MastodonStatus) => void;
  onState: (state: ClientStatus) => void;
  pollIntervalMs?: number;
  reconnectDelayMs?: number;
};

const DEFAULT_POLL_MS = 60_000;
const DEFAULT_RECONNECT_MS = 5_000;
const MAX_RECONNECT_MS = 60_000;

function isNewerId(a: string, b: string): boolean {
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    return a > b;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

export class NervClient {
  private readonly instance: string;
  private readonly account: string;
  private readonly onStatus: (status: MastodonStatus) => void;
  private readonly onState: (state: ClientStatus) => void;
  private readonly pollIntervalMs: number;
  private readonly reconnectDelayMs: number;

  private accountId: string | null = null;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private wsReconnectAttempt = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeenId: string | null = null;
  private stopped = false;
  private runToken: symbol | null = null;
  private fetchAbort: AbortController | null = null;

  constructor(opts: ClientOptions) {
    this.instance = opts.instance.replace(/\/$/, '');
    this.account = opts.account;
    this.onStatus = opts.onStatus;
    this.onState = opts.onState;
    this.pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? DEFAULT_RECONNECT_MS;
  }

  async start(): Promise<void> {
    if (this.fetchAbort) this.fetchAbort.abort();
    this.fetchAbort = new AbortController();
    const token = Symbol('nerv-run');
    this.runToken = token;
    this.stopped = false;
    this.onState('connecting');
    try {
      this.accountId = await this.lookupAccountId(this.account);
    } catch (err) {
      if (isAbortError(err)) return;
      console.warn('[nerv] account lookup failed', err);
      this.onState('error');
      return;
    }
    if (this.runToken !== token || this.stopped) return;
    await this.bootstrapInitial(token);
    if (this.runToken !== token || this.stopped) return;
    this.connectWebSocket();
  }

  stop(): void {
    this.stopped = true;
    this.runToken = null;
    if (this.fetchAbort) {
      this.fetchAbort.abort();
      this.fetchAbort = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  private async lookupAccountId(acct: string): Promise<string> {
    const url = `${this.instance}/api/v1/accounts/lookup?acct=${encodeURIComponent(acct)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: this.fetchAbort?.signal,
    });
    if (!res.ok) throw new Error(`lookup ${res.status}`);
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private async bootstrapInitial(token: symbol): Promise<void> {
    if (!this.accountId) return;
    try {
      const statuses = await this.fetchAccountStatuses(this.accountId, 20);
      if (this.runToken !== token || this.stopped) return;
      for (const s of statuses.reverse()) {
        this.deliver(s);
      }
    } catch (err) {
      if (!isAbortError(err)) console.warn('[nerv] initial fetch failed', err);
    }
  }

  private async fetchAccountStatuses(accountId: string, limit: number): Promise<MastodonStatus[]> {
    const url = `${this.instance}/api/v1/accounts/${accountId}/statuses?limit=${limit}&exclude_replies=true`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: this.fetchAbort?.signal,
    });
    if (!res.ok) throw new Error(`statuses ${res.status}`);
    return (await res.json()) as MastodonStatus[];
  }

  private connectWebSocket(): void {
    if (this.stopped) return;
    const wsBase = this.instance.replace(/^http/, 'ws');
    // public:local requires no auth; account-specific streams need OAuth.
    // Statuses are filtered by matchesAccount() after receipt.
    const url = `${wsBase}/api/v1/streaming?stream=public:local`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      console.warn('[nerv] ws construct failed', err);
      this.startPollingFallback();
      return;
    }
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.wsReconnectAttempt = 0;
      this.stopPollingFallback();
      this.onState('connected');
    });

    ws.addEventListener('message', (event) => {
      this.handleWsMessage(event.data);
    });

    ws.addEventListener('error', () => {
      // 'close' will fire next; handle reconnect there.
    });

    ws.addEventListener('close', () => {
      this.ws = null;
      if (this.stopped) return;
      this.startPollingFallback();
      this.scheduleReconnect();
    });
  }

  private handleWsMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: { event?: string; payload?: string };
    try {
      msg = JSON.parse(data) as { event?: string; payload?: string };
    } catch {
      return;
    }
    if (msg.event !== 'update' || typeof msg.payload !== 'string') return;
    let status: MastodonStatus;
    try {
      status = JSON.parse(msg.payload) as MastodonStatus;
    } catch {
      return;
    }
    if (!this.matchesAccount(status)) return;
    this.deliver(status);
  }

  private matchesAccount(status: MastodonStatus): boolean {
    const target = this.account.toLowerCase();
    const source = status.reblog ?? status;
    // acct may be fully-qualified ("UN_NERV@unnerv.jp") for remote boosts
    const acctLocal = source.account.acct.toLowerCase().split('@')[0] ?? '';
    return acctLocal === target || source.account.username.toLowerCase() === target;
  }

  private deliver(status: MastodonStatus): void {
    // Use the timeline entry ID (status.id) as the high-water mark so that
    // reblogs whose reblog.id is older than a previously-seen post are still delivered.
    if (this.lastSeenId !== null && !isNewerId(status.id, this.lastSeenId)) return;
    this.lastSeenId = status.id;
    this.onStatus(status);
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.wsReconnectTimer) return;
    const delay = Math.min(
      MAX_RECONNECT_MS,
      this.reconnectDelayMs * Math.pow(2, this.wsReconnectAttempt),
    );
    this.wsReconnectAttempt += 1;
    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this.connectWebSocket();
    }, delay);
  }

  private startPollingFallback(): void {
    if (this.stopped || this.pollTimer) return;
    this.onState('polling');
    const tick = async () => {
      this.pollTimer = null;
      if (this.stopped) return;
      if (this.accountId) {
        try {
          const statuses = await this.fetchAccountStatuses(this.accountId, 10);
          for (const s of statuses.reverse()) this.deliver(s);
          this.onState('polling');
        } catch (err) {
          if (isAbortError(err)) return;
          console.warn('[nerv] poll failed', err);
          this.onState('error');
        }
      }
      if (!this.stopped) {
        this.pollTimer = setTimeout(tick, this.pollIntervalMs);
      }
    };
    // First tick fires immediately; subsequent ticks use the configured interval
    this.pollTimer = setTimeout(tick, 0);
  }

  private stopPollingFallback(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
