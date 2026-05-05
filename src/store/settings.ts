import type { Category, IntensityCode } from '../nerv/types';
import { INTENSITY_CODES } from '../nerv/types';

export type Settings = {
  minIntensity: IntensityCode;
  categories: Record<Category, boolean>;
  maxItems: number;
  hideSettings: boolean;
  tsunamiAlwaysShow: boolean;
  eewAlwaysShowPreliminary: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  minIntensity: '3',
  categories: {
    eew: true,
    earthquake: true,
    tsunami: true,
    weather: true,
    volcano: false,
    other: false,
  },
  maxItems: 2,
  hideSettings: false,
  tsunamiAlwaysShow: true,
  eewAlwaysShowPreliminary: false,
};

const STORAGE_KEY = 'nerv-obs:settings:v1';
export const ALL_CATEGORIES: Category[] = ['eew', 'volcano', 'tsunami', 'weather', 'earthquake', 'other'];

export function isIntensityCode(value: string): value is IntensityCode {
  return (INTENSITY_CODES as readonly string[]).includes(value);
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

// Returns an all-or-nothing override: the URL param specifies the complete enabled set.
function parseCategories(value: string | null): Settings['categories'] {
  if (value === null) return DEFAULT_SETTINGS.categories;
  const enabled = new Set(value.split(',').map((s) => s.trim()).filter(Boolean));
  const out = { ...DEFAULT_SETTINGS.categories };
  for (const cat of ALL_CATEGORIES) {
    out[cat] = enabled.has(cat);
  }
  return out;
}

function readFromUrl(params: URLSearchParams, base: Settings): Partial<Settings> {
  const out: Partial<Settings> = {};
  const min = params.get('min');
  if (min && isIntensityCode(min)) out.minIntensity = min;
  if (params.has('cat')) out.categories = parseCategories(params.get('cat'));
  const max = params.get('max');
  if (max) {
    const n = Number.parseInt(max, 10);
    if (Number.isFinite(n) && n > 0) out.maxItems = Math.min(50, n);
  }
  if (params.has('kokokesu')) out.hideSettings = true;
  if (params.has('tsunamiAlwaysShow')) {
    out.tsunamiAlwaysShow = parseBool(params.get('tsunamiAlwaysShow'), base.tsunamiAlwaysShow);
  }
  if (params.has('eewPreliminary')) {
    out.eewAlwaysShowPreliminary = parseBool(params.get('eewPreliminary'), base.eewAlwaysShowPreliminary);
  }
  return out;
}

function sanitizeStoredSettings(raw: unknown): Partial<Settings> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const out: Partial<Settings> = {};
  if (typeof obj.minIntensity === 'string' && isIntensityCode(obj.minIntensity)) {
    out.minIntensity = obj.minIntensity;
  }
  if (typeof obj.maxItems === 'number' && Number.isFinite(obj.maxItems) && obj.maxItems > 0) {
    out.maxItems = Math.min(50, Math.floor(obj.maxItems));
  }
  // hideSettings is URL-only; ignore any stored value
  if (typeof obj.tsunamiAlwaysShow === 'boolean') out.tsunamiAlwaysShow = obj.tsunamiAlwaysShow;
  if (typeof obj.eewAlwaysShowPreliminary === 'boolean') out.eewAlwaysShowPreliminary = obj.eewAlwaysShowPreliminary;
  if (typeof obj.categories === 'object' && obj.categories !== null) {
    const cats = obj.categories as Record<string, unknown>;
    const merged: Settings['categories'] = { ...DEFAULT_SETTINGS.categories };
    for (const cat of ALL_CATEGORIES) {
      if (typeof cats[cat] === 'boolean') merged[cat] = cats[cat] as boolean;
    }
    out.categories = merged;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function readFromStorage(): Partial<Settings> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeStoredSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function mergeSettings(base: Settings, patch: Partial<Settings> | null): Settings {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    categories: { ...base.categories, ...(patch.categories ?? {}) },
  };
}

export function loadSettings(): Settings {
  const url = new URLSearchParams(window.location.search);
  const stored = readFromStorage();
  const fromUrl = readFromUrl(url, DEFAULT_SETTINGS);
  return mergeSettings(mergeSettings(DEFAULT_SETTINGS, stored), fromUrl);
}

export function saveSettings(settings: Settings): void {
  try {
    const { hideSettings: _, ...toStore } = settings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // storage unavailable; silently ignore
  }
}

// Returns null when called from a file:// context (OBS local file mode).
export function buildShareUrl(settings: Settings): string | null {
  if (window.location.protocol === 'file:') return null;
  const current = new URLSearchParams(window.location.search);
  const params = new URLSearchParams();
  // Preserve source overrides so the share URL works on custom instances
  const instance = current.get('instance');
  if (instance) params.set('instance', instance);
  const account = current.get('account');
  if (account) params.set('account', account);
  params.set('min', settings.minIntensity);
  const enabled = ALL_CATEGORIES.filter((c) => settings.categories[c]);
  params.set('cat', enabled.join(','));
  params.set('max', String(settings.maxItems));
  params.set('tsunamiAlwaysShow', settings.tsunamiAlwaysShow ? '1' : '0');
  params.set('eewPreliminary', settings.eewAlwaysShowPreliminary ? '1' : '0');
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?${params.toString()}&kokokesu`;
}
