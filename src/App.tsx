import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NervClient, type ClientStatus } from './nerv/client';
import { parseStatus } from './nerv/parser';
import type { MastodonStatus, ParsedPost } from './nerv/types';
import { WidgetList } from './components/WidgetList';
import { SettingsPanel } from './components/SettingsPanel';
import { isPostVisible } from './store/filter';
import { loadSettings, saveSettings, type Settings } from './store/settings';

const NERV_INSTANCE_DEFAULT = 'https://unnerv.jp';
const NERV_ACCOUNT_DEFAULT = 'UN_NERV';
const ALLOWED_INSTANCES = new Set([NERV_INSTANCE_DEFAULT]);

const STATUS_LABEL: Record<ClientStatus, string> = {
  connecting: '接続中…',
  connected: 'リアルタイム接続中',
  polling: 'ポーリング中 (再接続待ち)',
  error: '接続エラー — 再試行中',
};

export function App(): JSX.Element {
  const [nervInstance] = useState(() => {
    const raw = (new URLSearchParams(window.location.search).get('instance') ?? NERV_INSTANCE_DEFAULT).replace(/\/$/, '');
    return ALLOWED_INSTANCES.has(raw) ? raw : NERV_INSTANCE_DEFAULT;
  });
  const [nervAccount] = useState(
    () => new URLSearchParams(window.location.search).get('account') ?? NERV_ACCOUNT_DEFAULT
  );

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [posts, setPosts] = useState<ParsedPost[]>([]);
  const [connection, setConnection] = useState<ClientStatus>('connecting');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  // seenIdsRef uses source.id (original post) to deduplicate reblogs sharing the same content.
  // client.ts uses status.id (timeline entry) as the high-water mark — intentionally different.
  const seenIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('kokokesu');
    const base = params.toString();
    const search = settings.hideSettings
      ? base ? `${base}&kokokesu` : 'kokokesu'
      : base;
    history.replaceState(null, '', search ? `?${search}` : window.location.pathname);
  }, [settings.hideSettings]);

  useEffect(() => {
    const client = new NervClient({
      instance: nervInstance,
      account: nervAccount,
      onStatus: (status: MastodonStatus) => {
        const source = status.reblog ?? status;
        if (seenIdsRef.current.has(source.id)) return;
        seenIdsRef.current.add(source.id);
        const parsed = parseStatus(status);
        setPosts((prev) =>
          [parsed, ...prev.filter((p) => p.id !== parsed.id)].slice(0, 100)
        );
      },
      onState: setConnection,
    });
    void client.start();
    return () => client.stop();
  }, [nervInstance, nervAccount]);

  // Keep seenIdsRef bounded to currently-stored posts to prevent unbounded growth
  useEffect(() => {
    seenIdsRef.current = new Set(posts.map((p) => p.id));
  }, [posts]);

  useEffect(() => {
    setDismissedIds((prev) => {
      if (prev.size === 0) return prev;
      const postIds = new Set(posts.map((p) => p.id));
      const next = new Set([...prev].filter((id) => postIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [posts]);

  const handleDismiss = useCallback((id: string) => {
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const visiblePosts = useMemo(() => {
    return posts
      .filter((p) => isPostVisible(p, settings) && !dismissedIds.has(p.id))
      .slice(0, settings.maxItems);
  }, [posts, settings, dismissedIds]);

  return (
    <div className="widget">
      <WidgetList
        posts={visiblePosts}
        emptyMessage={connection === 'connecting' ? '接続中…' : '該当する情報はまだありません'}
        onDismiss={handleDismiss}
      />
      {!settings.hideSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          connectionLabel={STATUS_LABEL[connection]}
        />
      )}
    </div>
  );
}
