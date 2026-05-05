import { useEffect, useRef, useState } from 'react';
import { CATEGORY_LABEL, INTENSITY_CODES } from '../nerv/types';
import type { Settings } from '../store/settings';
import { ALL_CATEGORIES, buildShareUrl, isIntensityCode } from '../store/settings';

type Props = {
  settings: Settings;
  onChange: (next: Settings) => void;
  connectionLabel: string;
};

export function SettingsPanel({ settings, onChange, connectionLabel }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(copyResetTimer.current), []);

  const handleCopy = async () => {
    clearTimeout(copyResetTimer.current);
    const url = buildShareUrl(settings);
    if (url === null) {
      setCopyState('error');
      copyResetTimer.current = setTimeout(() => setCopyState('idle'), 1500);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    copyResetTimer.current = setTimeout(() => setCopyState('idle'), 1500);
  };

  return (
    <div className={`settings ${open ? 'settings--open' : ''}`}>
      <button
        type="button"
        className="settings__toggle"
        aria-label={open ? '設定を閉じる' : '設定を開く'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? '✕' : '⚙'}</span>
      </button>

      {open && (
        <div className="settings__panel" role="dialog" aria-label="ウィジェット設定">
          <div className="settings__row">
            <span className="settings__label">接続</span>
            <span className="settings__value">{connectionLabel}</span>
          </div>

          <label className="settings__row">
            <span className="settings__label">最小震度</span>
            <select
              value={settings.minIntensity}
              onChange={(e) => { const v = e.target.value; if (isIntensityCode(v)) onChange({ ...settings, minIntensity: v }); }}
            >
              {INTENSITY_CODES.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </label>

          <fieldset className="settings__row settings__row--block">
            <legend className="settings__label">表示カテゴリ</legend>
            <div className="settings__categories">
              {ALL_CATEGORIES.map((cat) => (
                <label key={cat} className="settings__check">
                  <input
                    type="checkbox"
                    checked={settings.categories[cat]}
                    onChange={(e) =>
                      onChange({
                        ...settings,
                        categories: { ...settings.categories, [cat]: e.target.checked },
                      })
                    }
                  />
                  <span>{CATEGORY_LABEL[cat]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="settings__row">
            <span className="settings__label">最大表示件数</span>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.maxItems}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                if (Number.isFinite(n) && n > 0) onChange({ ...settings, maxItems: Math.min(50, n) });
              }}
            />
          </label>

          <label className="settings__check">
            <input
              type="checkbox"
              checked={settings.tsunamiAlwaysShow}
              onChange={(e) => onChange({ ...settings, tsunamiAlwaysShow: e.target.checked })}
            />
            <span>津波情報を常に表示（カテゴリ・震度フィルタを無視）</span>
          </label>

          <label className="settings__check">
            <input
              type="checkbox"
              checked={settings.hideSettings}
              onChange={(e) => onChange({ ...settings, hideSettings: e.target.checked })}
            />
            <span>本番モード (歯車アイコンも隠す)</span>
          </label>

          <div className="settings__actions">
            <button type="button" onClick={handleCopy}>
              {copyState === 'copied' ? 'コピーしました' : copyState === 'error' ? 'コピー失敗' : '本番モードONの共有URLをコピー'}
            </button>
          </div>

          <p className="settings__hint">
            ※「本番モード」を有効化すると歯車アイコンが完全に消えます。再度設定を開くには、OBSブラウザソースのURLから <code>kokokesu</code> を削除してください。
          </p>
        </div>
      )}
    </div>
  );
}
