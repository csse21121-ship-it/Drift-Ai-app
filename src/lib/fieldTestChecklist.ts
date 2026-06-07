import AsyncStorage from '@react-native-async-storage/async-storage';

export type FieldTestCheckId =
  | 'ble_connected'
  | 'ble_telemetry'
  | 'ble_tier'
  | 'gps_lock'
  | 'gps_quality'
  | 'gps_relax'
  | 'gps_drift_detect'
  | 'tsuiso_room'
  | 'tsuiso_sync'
  | 'tsuiso_score'
  | 'tsuiso_offline';

export type FieldTestCheckItem = {
  id: FieldTestCheckId;
  group: 'ble' | 'gps' | 'tsuiso';
  label: string;
  hint: string;
};

export const FIELD_TEST_CHECKS: FieldTestCheckItem[] = [
  {
    id: 'ble_connected',
    group: 'ble',
    label: 'BLE ロガー接続',
    hint: 'Development Build で設定 → External Logger から接続',
  },
  {
    id: 'ble_telemetry',
    group: 'ble',
    label: 'G / 速度 / GPS 受信',
    hint: '走行またはエンジン吹け上げで値が更新される',
  },
  {
    id: 'ble_tier',
    group: 'ble',
    label: 'Tier 推定表示',
    hint: 'basic 以上・採点自動調整 ON',
  },
  {
    id: 'gps_lock',
    group: 'gps',
    label: '屋外 GPS LOCK',
    hint: '±精度表示が LOCKED / ACQUIRING になる',
  },
  {
    id: 'gps_quality',
    group: 'gps',
    label: '精度ティア良好〜標準',
    hint: '±15m 以内で「良好」または「標準」',
  },
  {
    id: 'gps_relax',
    group: 'gps',
    label: '精度低下時の閾値緩和',
    hint: 'トンネル/ビル影で「閾値緩和」表示を確認（任意）',
  },
  {
    id: 'gps_drift_detect',
    group: 'gps',
    label: 'ドリフト検知',
    hint: 'CALIBRATE 後、低速旋回で DRIFT ACTIVE',
  },
  {
    id: 'tsuiso_room',
    group: 'tsuiso',
    label: 'Lead ルーム + PIN',
    hint: '追走モード → ルーム作成 → 4桁 PIN',
  },
  {
    id: 'tsuiso_sync',
    group: 'tsuiso',
    label: 'Chase 入室 → Sync Ready',
    hint: '2台で PIN 接続・Sync Ready 表示',
  },
  {
    id: 'tsuiso_score',
    group: 'tsuiso',
    label: 'STOP 後スコア表示',
    hint: '両方 STOP → 追走スコア自動表示',
  },
  {
    id: 'tsuiso_offline',
    group: 'tsuiso',
    label: '圏外 .tsuiso 同期（任意）',
    hint: 'オフライン記録 → ファイル共有 → 採点',
  },
];

const STORAGE_KEY = '@driftscore/field_test_checklist';

export type FieldTestCheckState = Record<FieldTestCheckId, boolean>;

function emptyState(): FieldTestCheckState {
  return FIELD_TEST_CHECKS.reduce(
    (acc, item) => {
      acc[item.id] = false;
      return acc;
    },
    {} as FieldTestCheckState,
  );
}

export async function loadFieldTestChecklist(): Promise<FieldTestCheckState> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (!json) return emptyState();
    const parsed = JSON.parse(json) as Partial<FieldTestCheckState>;
    return { ...emptyState(), ...parsed };
  } catch {
    return emptyState();
  }
}

export async function saveFieldTestChecklist(state: FieldTestCheckState): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function resetFieldTestChecklist(): Promise<FieldTestCheckState> {
  const state = emptyState();
  await saveFieldTestChecklist(state);
  return state;
}

export function countCompleted(state: FieldTestCheckState): number {
  return FIELD_TEST_CHECKS.filter((item) => state[item.id]).length;
}
