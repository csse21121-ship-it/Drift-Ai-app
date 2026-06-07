/**
 * セッションストア
 *
 * ── 2層構成 ──────────────────────────────────────────────────
 *
 *  1. インメモリ（同期）
 *     - 現在のセッション結果を一時保持
 *     - 結果画面への画面遷移でデータを渡すために使用
 *     - アプリ再起動で消える
 *
 *  2. AsyncStorage（非同期）
 *     - 全セッション履歴を JSON 配列で保存
 *     - アプリ再起動後も維持
 *     - 最大 MAX_HISTORY 件。超えると古い順に削除
 *
 * ── API ──────────────────────────────────────────────────────
 *
 *  同期（インメモリ）:
 *    saveSession(result)    セッション結果をメモリに保存
 *    getLastSession()       最後のセッション結果を取得
 *    clearSession()         メモリをクリア
 *
 *  非同期（AsyncStorage）:
 *    persistSession(result) 履歴に追記して SessionHistoryEntry を返す
 *    loadHistory()          全履歴を新しい順で返す
 *    deleteHistoryEntry(id) 指定 ID のエントリを削除
 *    clearHistory()         全履歴を削除
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionHistoryEntry, SessionResult } from '@/types/score';

// ── 定数 ────────────────────────────────────────────────────

const HISTORY_KEY = '@driftscore/session_history';
const MAX_HISTORY = 50;

// ── インメモリ（同期）────────────────────────────────────────

let _current: SessionResult | null = null;

export function saveSession(result: SessionResult): void {
  _current = result;
}

export function getLastSession(): SessionResult | null {
  return _current;
}

export function clearSession(): void {
  _current = null;
}

// ── AsyncStorage（非同期）───────────────────────────────────

/**
 * セッション結果を履歴に保存する。
 * 既存の履歴を読み込んでから先頭に追加し、MAX_HISTORY 件に切り詰めて書き戻す。
 * @returns 保存した履歴エントリ（id・savedAt 付き）
 */
export async function persistSession(
  result: SessionResult,
): Promise<SessionHistoryEntry> {
  const entry: SessionHistoryEntry = {
    ...result,
    id: `session_${Date.now()}`,
    savedAt: Date.now(),
  };

  const existing = await loadHistory();
  const updated = [entry, ...existing].slice(0, MAX_HISTORY);

  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  return entry;
}

/**
 * 全履歴を新しい順（savedAt 降順）で返す。
 * 読み込み失敗時は空配列を返す。
 */
export async function loadHistory(): Promise<SessionHistoryEntry[]> {
  try {
    const json = await AsyncStorage.getItem(HISTORY_KEY);
    if (!json) return [];
    const parsed = JSON.parse(json) as SessionHistoryEntry[];
    // savedAt 降順でソートして返す（念のため）
    return parsed.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/**
 * 指定 ID のエントリを削除する。
 */
export async function deleteHistoryEntry(id: string): Promise<void> {
  const existing = await loadHistory();
  const updated = existing.filter((e) => e.id !== id);
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

/**
 * 全履歴を削除する。
 */
export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(HISTORY_KEY);
}
