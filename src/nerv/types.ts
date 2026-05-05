export const INTENSITY_CODES = ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'] as const;
export type IntensityCode = (typeof INTENSITY_CODES)[number];

export const INTENSITY_VALUE: Record<IntensityCode, number> = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5-': 5,
  '5+': 5.5,
  '6-': 6,
  '6+': 6.5,
  '7': 7,
};

export type Category =
  | 'eew'
  | 'earthquake'
  | 'tsunami'
  | 'weather'
  | 'volcano'
  | 'other';

export const CATEGORY_LABEL: Record<Category, string> = {
  eew: '緊急地震速報',
  earthquake: '地震情報',
  tsunami: '津波',
  weather: '気象警報',
  volcano: '火山',
  other: 'その他',
};

export type Severity = 'critical' | 'warning' | 'advisory' | 'info';

export type MastodonStatus = {
  id: string;
  uri: string;
  url: string | null;
  created_at: string;
  content: string;
  account: {
    acct: string;
    username: string;
    display_name: string;
    avatar: string;
  };
  reblog: MastodonStatus | null;
};

export type ParsedPost = {
  id: string;
  url: string | null;
  createdAt: string;
  rawText: string;
  title: string;
  body: string;
  category: Category;
  severity: Severity;
  intensity: IntensityCode | null;
  isFinalReport: boolean;
};
