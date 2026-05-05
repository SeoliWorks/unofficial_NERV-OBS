import { INTENSITY_VALUE } from './types';
import type {
  Category,
  IntensityCode,
  MastodonStatus,
  ParsedPost,
  Severity,
} from './types';

const CATEGORY_RULES: Array<{ category: Category; severity: Severity; patterns: RegExp[] }> = [
  {
    category: 'tsunami',
    severity: 'critical',
    patterns: [/大津波警報/, /津波警報/, /津波注意報/, /津波予報/, /津波情報/],
  },
  {
    category: 'eew',
    severity: 'warning',
    patterns: [/緊急地震速報/],
  },
  {
    category: 'earthquake',
    severity: 'info',
    patterns: [/震度速報/, /震源[・･]?震度(?:に関する)?情報/, /地震情報/, /遠地地震情報/],
  },
  {
    category: 'volcano',
    severity: 'warning',
    patterns: [/噴火警報/, /噴火速報/, /火山(?:の状況に関する)?(?:解説)?情報/, /降灰予報/],
  },
  {
    category: 'weather',
    severity: 'warning',
    patterns: [
      /特別警報/,
      /記録的短時間大雨情報/,
      /竜巻注意情報/,
      /土砂災害警戒情報/,
      /気象警報[・･]?注意報/,
      /気象警報/,
      /気象注意報/,
      /大雨警報/,
      /大雨情報/,
      /洪水警報/,
      /暴風警報/,
      /大雪警報/,
      /高潮警報/,
      /波浪警報/,
      /台風情報/,
      /熱中症警戒アラート/,
    ],
  },
];

// These override CATEGORY_RULES defaults (first match wins).
// e.g. 大津波警報→critical, 津波警報/気象警報→warning, 津波注意報→advisory
//
// ORDER IS LOAD-BEARING: /警報/ matches inside 大津波警報 and 特別警報, so the critical
// entry must come before the warning entry. Do not reorder without updating the patterns.
const SEVERITY_OVERRIDES: Array<{ severity: Severity; pattern: RegExp }> = [
  { severity: 'critical', pattern: /大津波警報|特別警報|噴火警報|緊急地震速報[（(]警報[）)]/ },
  { severity: 'warning', pattern: /警報|警戒/ },
  { severity: 'advisory', pattern: /注意報|注意/ },
];

function htmlToText(html: string): string {
  // Inject newlines at block boundaries before stripping tags, since textContent collapses them.
  const normalized = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n');

  // Prefer DOMParser in browser environments (handles all entities correctly).
  // Fall back to regex-based stripping in Node (smoke test).
  let text: string;
  if (typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(normalized, 'text/html');
    text = doc.body.textContent ?? '';
  } else {
    text = normalized
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function detectIntensity(text: string): IntensityCode | null {
  const pattern = /震度\s*([1-7])(?:\s*(弱|強))?/g;
  let max: IntensityCode | null = null;
  let maxValue = -1;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const num = match[1];
    const suffix = match[2];
    if (!num) continue;
    // 弱/強 distinction is only valid for intensities 5 and 6 on the JMA scale
    const code: IntensityCode =
      (num === '5' || num === '6') && suffix === '弱' ? (`${num}-` as IntensityCode)
      : (num === '5' || num === '6') && suffix === '強' ? (`${num}+` as IntensityCode)
      : (num as IntensityCode);
    const value = INTENSITY_VALUE[code];
    if (value > maxValue) {
      maxValue = value;
      max = code;
    }
  }
  return max;
}

function detectCategoryAndSeverity(text: string): { category: Category; severity: Severity } {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      let severity: Severity = rule.severity;
      for (const override of SEVERITY_OVERRIDES) {
        if (override.pattern.test(text)) {
          severity = override.severity;
          break;
        }
      }
      return { category: rule.category, severity };
    }
  }
  return { category: 'other', severity: 'info' };
}

function extractTitle(text: string): { title: string; body: string } {
  const trimmed = text.trim();
  const bracketMatch = trimmed.match(/^【([^】]+)】\s*/);
  if (bracketMatch) {
    return {
      title: bracketMatch[1]!.trim(),
      body: trimmed.slice(bracketMatch[0].length).trim(),
    };
  }
  const firstLineEnd = trimmed.indexOf('\n');
  if (firstLineEnd === -1) {
    return { title: trimmed.slice(0, 40), body: '' };
  }
  return {
    title: trimmed.slice(0, firstLineEnd).trim(),
    body: trimmed.slice(firstLineEnd + 1).trim(),
  };
}

function detectFinalReport(text: string): boolean {
  return /最終報|【?確定報】?|（最終）|\(最終\)/.test(text);
}

export function parseStatus(status: MastodonStatus): ParsedPost {
  const source = status.reblog ?? status;
  const text = htmlToText(source.content);
  const { title, body } = extractTitle(text);
  const { category, severity } = detectCategoryAndSeverity(text);
  const intensity = detectIntensity(text);

  return {
    id: source.id,
    url: source.url,
    createdAt: source.created_at,
    rawText: text,
    title,
    body,
    category,
    severity,
    intensity,
    isFinalReport: detectFinalReport(text),
  };
}
