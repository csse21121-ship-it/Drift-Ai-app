import type { MountOrientationOverride } from '@/types/settings';

export const MOUNT_OPTIONS: {
  value: MountOrientationOverride;
  label: string;
  desc: string;
}[] = [
  { value: 'auto', label: 'AUTO', desc: '自動検知' },
  { value: 'flat', label: 'FLAT', desc: '平置き（画面上）' },
  { value: 'portrait', label: 'PORT', desc: '縦置き' },
  { value: 'landscape', label: 'LAND', desc: '横置き' },
];
