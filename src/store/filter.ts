import type { ParsedPost } from '../nerv/types';
import { INTENSITY_VALUE } from '../nerv/types';
import type { Settings } from './settings';

export function isPostVisible(post: ParsedPost, settings: Settings): boolean {
  if (settings.tsunamiAlwaysShow && post.category === 'tsunami') return true;
  if (settings.eewAlwaysShowPreliminary && post.category === 'eew') return true;
  if (!settings.categories[post.category]) return false;

  if (post.category === 'eew') {
    if (post.intensity === null) return false;
    return INTENSITY_VALUE[post.intensity] >= INTENSITY_VALUE[settings.minIntensity];
  }
  if (post.category === 'earthquake') {
    if (post.intensity === null) {
      return settings.minIntensity === '0';
    }
    return INTENSITY_VALUE[post.intensity] >= INTENSITY_VALUE[settings.minIntensity];
  }
  return true;
}
