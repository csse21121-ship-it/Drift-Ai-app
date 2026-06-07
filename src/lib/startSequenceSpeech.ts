/**
 * 計測開始シークエンス — expo-speech 読み上げ
 * ハイテンション女性オペレーターボイス（追走スケジュール・スタート共通）
 */

import * as Speech from 'expo-speech';

/** スタート演出 / 待機アナウンス共通の音声設定 */
export const START_SEQUENCE_SPEECH_OPTS: Speech.SpeechOptions = {
  language: 'en-US',
  rate: 1.15,
  pitch: 1.4,
};

export function speakStartSequenceLine(text: string): void {
  Speech.stop();
  Speech.speak(text, START_SEQUENCE_SPEECH_OPTS);
}

export function speakSystemCheckIntro(): void {
  speakStartSequenceLine(
    'Telemetry systems online. Calibrating sensors. All systems go.',
  );
}

const COUNTDOWN_WORDS: Record<number, string> = {
  5: 'Five!',
  4: 'Four!',
  3: 'Three!',
  2: 'Two!',
  1: 'One!',
  0: 'GO GO GO!!!',
};

export function speakCountdown(n: number): void {
  const word = COUNTDOWN_WORDS[n];
  if (!word) return;
  speakStartSequenceLine(word);
}

/** 待機中 5 秒おき状況アナウンス (30 / 25 / 20 / 15 / 10 秒前) */
const STANDBY_ANNOUNCE_WORDS: Record<number, string> = {
  30: 'Thirty',
  25: 'Twenty-five',
  20: 'Twenty',
  15: 'Fifteen',
  10: 'Ten',
};

export function speakStandbyAnnounce(secondsBefore: number): void {
  const word = STANDBY_ANNOUNCE_WORDS[secondsBefore];
  if (!word) return;
  speakStartSequenceLine(word);
}

export function stopStartSequenceSpeech(): void {
  Speech.stop();
}
