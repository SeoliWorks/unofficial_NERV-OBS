// Smoke-test parser output. Run with: node scripts/test-parser.mjs
import { execSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const target = join(process.cwd(), 'scripts', '_parser_smoke.ts');
const driver = `
import { parseStatus } from '../src/nerv/parser';

const make = (id: string, content: string) => ({
  id, uri: '', url: null, created_at: new Date().toISOString(), content,
  account: { acct: 'UN_NERV', username: 'UN_NERV', display_name: 'NERV', avatar: '' },
  media_attachments: [], reblog: null,
});

const samples = [
  make('1', '<p>【緊急地震速報 第3報】<br>福島県沖で地震、最大震度5強と推定。</p>'),
  make('2', '<p>【震度速報】<br>06時00分ごろ、最大震度3を観測する地震がありました。</p>'),
  make('3', '<p>【大津波警報】<br>太平洋沿岸に大津波警報が発表されました。</p>'),
  make('4', '<p>【気象警報・注意報】<br>東京都に大雨警報が発表されました。</p>'),
  make('5', '<p>【地震情報】<br>三陸沖でM5.2、最大震度4の地震。最終報。</p>'),
  make('6', '<p>【噴火警報】<br>桜島で噴火が発生しました。</p>'),
  make('7', '<p>【記録的短時間大雨情報】<br>東京都で1時間に120ミリ。</p>'),
  make('8', '<p>【鉄道情報】<br>JR山手線が遅延しています。</p>'),
];

for (const s of samples) {
  const p = parseStatus(s as any);
  console.log(JSON.stringify({
    title: p.title,
    category: p.category,
    severity: p.severity,
    intensity: p.intensity,
    isFinalReport: p.isFinalReport,
  }));
}
`;

writeFileSync(target, driver, 'utf8');
try {
  const out = execSync(`npx -y tsx ${JSON.stringify(target)}`, { encoding: 'utf8' });
  process.stdout.write(out);
} finally {
  rmSync(target, { force: true });
}
