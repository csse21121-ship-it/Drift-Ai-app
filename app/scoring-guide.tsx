/**
 * SCORING GUIDE — 採点システム解説画面
 *
 * 100点満点の評価スコア・加点基準・減点基準・グレード評価を解説する。
 */
import { useState, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GamePressable } from '@/components/ui/GamePressable';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { router } from 'expo-router';
import { TSUISO_PENALTY_RULES } from '@/data/tsuisoPenaltyRules';
import type { ScoringProfile } from '@/types/course';

// ── グレードテーブル（scoring.ts と同値） ───────────────────────
const GRADE_TABLE: Record<
  ScoringProfile['gradeDifficulty'],
  { grade: string; min: number; label: string }[]
> = {
  easy: [
    { grade: 'S', min: 4000,  label: 'PERFECT' },
    { grade: 'A', min: 2500,  label: 'EXCELLENT' },
    { grade: 'B', min: 1200,  label: 'GOOD' },
    { grade: 'C', min: 400,   label: 'FAIR' },
    { grade: 'D', min: 0,     label: 'KEEP TRYING' },
  ],
  normal: [
    { grade: 'S', min: 8000,  label: 'PERFECT' },
    { grade: 'A', min: 5000,  label: 'EXCELLENT' },
    { grade: 'B', min: 2500,  label: 'GOOD' },
    { grade: 'C', min: 800,   label: 'FAIR' },
    { grade: 'D', min: 0,     label: 'KEEP TRYING' },
  ],
  hard: [
    { grade: 'S', min: 12000, label: 'PERFECT' },
    { grade: 'A', min: 8000,  label: 'EXCELLENT' },
    { grade: 'B', min: 4000,  label: 'GOOD' },
    { grade: 'C', min: 1500,  label: 'FAIR' },
    { grade: 'D', min: 0,     label: 'KEEP TRYING' },
  ],
  pro: [
    { grade: 'S', min: 20000, label: 'PERFECT' },
    { grade: 'A', min: 13000, label: 'EXCELLENT' },
    { grade: 'B', min: 7000,  label: 'GOOD' },
    { grade: 'C', min: 3000,  label: 'FAIR' },
    { grade: 'D', min: 0,     label: 'KEEP TRYING' },
  ],
};

const DIFF_LABELS: Record<ScoringProfile['gradeDifficulty'], string> = {
  easy: 'EASY', normal: 'NORMAL', hard: 'HARD', pro: 'PRO',
};
function diffColors(colors: import('@/constants/uiThemes').ThemeColors): Record<ScoringProfile['gradeDifficulty'], string> {
  return {
    easy: '#00BFFF', normal: colors.neonGreen, hard: colors.amber, pro: colors.recRed,
  };
}
const DIFFICULTIES: ScoringProfile['gradeDifficulty'][] = ['easy', 'normal', 'hard', 'pro'];

// ── 小コンポーネント ────────────────────────────────────────────

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  const s = useS();
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionHeaderLine} />
      <View style={s.sectionHeaderBody}>
        <Text style={s.sectionHeaderLabel}>{label}</Text>
        {sub && <Text style={s.sectionHeaderSub}>{sub}</Text>}
      </View>
    </View>
  );
}

function ScoreBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  const sb = useSb();
  return (
    <View style={[sb.track, { height }]}>
      <View style={[sb.fill, { width: `${Math.min(100, pct)}%`, backgroundColor: color, height }]} />
    </View>
  );
}
function createSb(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  track: { flex: 1, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  fill:  { borderRadius: 3 },
});
}

function useSb() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createSb(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}

function BonusCard({
  sign, color, icon, title, sub, detail,
}: {
  sign: '+' | '−'; color: string; icon: string;
  title: string; sub: string; detail: string;
}) {
  const bc = useBc();
  return (
    <View style={[bc.card, { borderLeftColor: color }]}>
      <View style={bc.iconWrap}>
        <Text style={[bc.sign, { color }]}>{sign}</Text>
        <Text style={bc.icon}>{icon}</Text>
      </View>
      <View style={bc.body}>
        <View style={bc.titleRow}>
          <Text style={[bc.title, { color }]}>{title}</Text>
          <Text style={bc.sub}>{sub}</Text>
        </View>
        <Text style={bc.detail}>{detail}</Text>
      </View>
    </View>
  );
}
function createBc(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  card:    { flexDirection: 'row', borderLeftWidth: 3, borderRadius: 4, backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, gap: spacing.sm, alignItems: 'flex-start' },
  iconWrap:{ width: 32, alignItems: 'center', gap: 2, paddingTop: 2 },
  sign:    { ...typography.label, fontSize: 13, fontWeight: '900' },
  icon:    { fontSize: 16 },
  body:    { flex: 1, gap: 4 },
  titleRow:{ flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title:   { ...typography.label, fontSize: 10, letterSpacing: 1.5 },
  sub:     { ...typography.label, color: colors.textMuted, fontSize: 8 },
  detail:  { ...typography.mono, color: colors.textSecondary, fontSize: 10, lineHeight: 15 },
});
}

function useBc() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createBc(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}

function FormulaBlock() {
  const fb = useFb();
  const { colors } = useTheme();
  const factors = [
    { key: 'BASE',  color: colors.neonGreen,  ja: '横G × 時間 × 速度' },
    { key: 'ANGLE', color: '#00BFFF',         ja: 'スリップアングル' },
    { key: 'COMBO', color: colors.amber,      ja: '連続ドリフト' },
    { key: 'ZONE',  color: '#FF88AA',         ja: '採点ゾーン' },
  ];
  return (
    <View style={fb.wrap}>
      <Text style={fb.eq}>FINAL POINTS  =</Text>
      <View style={fb.row}>
        {factors.map((f, i) => (
          <View key={f.key} style={fb.termWrap}>
            {i > 0 && <Text style={fb.times}>×</Text>}
            <View style={[fb.term, { borderColor: f.color + 'AA', backgroundColor: f.color + '12' }]}>
              <Text style={[fb.termKey, { color: f.color }]}>{f.key}</Text>
              <Text style={fb.termJa}>{f.ja}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={fb.note}>
        ※ S ランク閾値を 100 点として評価スコア（0〜100）に換算表示
      </Text>
    </View>
  );
}
function createFb(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  wrap:   { backgroundColor: colors.surface, borderRadius: 6, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  eq:     { ...typography.mono, color: colors.textMuted, fontSize: 10, letterSpacing: 1 },
  row:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  termWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  times:  { ...typography.mono, color: colors.textMuted, fontSize: 14 },
  term:   { borderWidth: 1, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 6, alignItems: 'center', gap: 2 },
  termKey:{ ...typography.label, fontSize: 9, letterSpacing: 2, fontWeight: '900' },
  termJa: { fontSize: 9, color: colors.textMuted, textAlign: 'center' },
  note:   { ...typography.mono, color: colors.textMuted, fontSize: 9, lineHeight: 14 },
});
}

function useFb() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createFb(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}

function ComboTable() {
  const ct = useCt();
  const { colors } = useTheme();
  const rows = [
    { c: 1, mult: 1.0 },
    { c: 2, mult: 1.5 },
    { c: 3, mult: 2.0 },
    { c: 4, mult: 2.5 },
    { c: 5, mult: 3.0 },
  ];
  return (
    <View style={ct.wrap}>
      {rows.map((r) => {
        const pct = ((r.mult - 1) / 2) * 100;
        const col = r.c === 5 ? colors.gold : r.c >= 3 ? colors.amber : colors.neonGreen;
        return (
          <View key={r.c} style={ct.row}>
            <Text style={[ct.combo, { color: col }]}>
              COMBO {r.c}{r.c === 5 ? '  ★MAX' : ''}
            </Text>
            <View style={ct.barWrap}>
              <ScoreBar pct={pct} color={col} height={8} />
            </View>
            <Text style={[ct.mult, { color: col }]}>×{r.mult.toFixed(1)}</Text>
          </View>
        );
      })}
    </View>
  );
}
function createCt(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  wrap:   { gap: 8 },
  row:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  combo:  { ...typography.label, fontSize: 8, width: 80 },
  barWrap:{ flex: 1 },
  mult:   { ...typography.mono, fontSize: 12, fontWeight: '700', width: 38, textAlign: 'right' },
});
}

function useCt() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createCt(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}

function GradeTableSection({ difficulty }: { difficulty: ScoringProfile['gradeDifficulty'] }) {
  const gt = useGt();
  const { colors, gradeColor } = useTheme();
  const rows   = GRADE_TABLE[difficulty];
  const sMin   = rows[0].min;
  const dColor = diffColors(colors)[difficulty];
  return (
    <View style={gt.wrap}>
      {rows.map((r) => {
        const color = gradeColor[r.grade] ?? colors.textMuted;
        const pct   = r.min > 0 ? Math.round((r.min / sMin) * 100) : 3;
        const pts   = r.min > 0 ? `${r.min.toLocaleString()} pt〜` : '0 pt';
        const normalized = r.min > 0 ? Math.round((r.min / sMin) * 100) : 0;
        return (
          <View key={r.grade} style={gt.row}>
            <View style={[gt.grade, { borderColor: color + '88', backgroundColor: color + '18' }]}>
              <Text style={[gt.gradeText, { color }]}>{r.grade}</Text>
            </View>
            <View style={gt.center}>
              <View style={gt.barRow}>
                <ScoreBar pct={pct} color={color} height={10} />
              </View>
              <Text style={gt.label}>{r.label}</Text>
            </View>
            <View style={gt.right}>
              <Text style={[gt.norm, { color }]}>{normalized}/100</Text>
              <Text style={gt.pts}>{pts}</Text>
            </View>
          </View>
        );
      })}
      <View style={[gt.diffNote, { borderColor: dColor + '55' }]}>
        <Text style={[gt.diffNoteText, { color: dColor }]}>
          {DIFF_LABELS[difficulty]} 難易度の S ランク基準値 = {sMin.toLocaleString()} pt = 100 点
        </Text>
      </View>
    </View>
  );
}
function createGt(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  wrap:        { gap: 8 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grade:       { width: 32, height: 32, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  gradeText:   { fontSize: 16, fontWeight: '900' },
  center:      { flex: 1, gap: 3 },
  barRow:      { flexDirection: 'row', alignItems: 'center' },
  label:       { ...typography.label, color: colors.textMuted, fontSize: 7 },
  right:       { alignItems: 'flex-end', gap: 2 },
  norm:        { ...typography.mono, fontSize: 13, fontWeight: '700' },
  pts:         { ...typography.mono, color: colors.textMuted, fontSize: 8 },
  diffNote:    { borderWidth: 1, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, marginTop: 4 },
  diffNoteText:{ ...typography.label, fontSize: 8, letterSpacing: 1 },
});
}

function useGt() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createGt(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}

// ── メイン ──────────────────────────────────────────────────────

export default function ScoringGuideScreen() {
  const s = useS();
  const { colors, spacing } = useTheme();
  const [activeDiff, setActiveDiff] = useState<ScoringProfile['gradeDifficulty']>('normal');

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* ヘッダー */}
      <View style={s.header}>
        <GamePressable onPress={() => router.back()} hitSlop={10} style={s.backBtn}>
          <Text style={s.backBtnText}>← BACK</Text>
        </GamePressable>
        <View style={s.headerTitle}>
          <Text style={s.title}>SCORING</Text>
          <Text style={s.titleAccent}> SYSTEM</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* サブタイトル帯 */}
      <View style={s.subBand}>
        <Text style={s.subBandText}>採点システム完全解説  ·  100 POINT EVALUATION</Text>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ━━ SECTION 1: 評価スコアとは ━━ */}
        <SectionHeader label="01 · EVALUATION SCORE" sub="評価スコアとは" />
        <View style={s.card}>
          <Text style={s.cardHeadline}>
            <Text style={{ color: colors.neonGreen }}>0</Text>
            {'  〜  '}
            <Text style={{ color: colors.gold }}>100</Text>
            {'  点満点'}
          </Text>
          <Text style={s.cardBody}>
            セッション中に蓄積した生ポイントを、コースの難易度設定（EASY / NORMAL / HARD / PRO）における <Text style={{ color: colors.gold }}>S ランク基準値（= 100 点）</Text> に対する達成率として換算します。{'\n\n'}
            S ランク到達で <Text style={{ color: colors.gold }}>100 点</Text>。{'\n'}
            それ以上の得点を出しても表示は 100 点が上限となります。
          </Text>
          {/* 換算イメージ */}
          <View style={s.convertBox}>
            <View style={s.convertRow}>
              <Text style={s.convertLabel}>NORMAL  /  S ランク = 8,000 pt</Text>
            </View>
            {[
              { pt: 8000, score: 100, grade: 'S', color: colors.gold },
              { pt: 5000, score: 63,  grade: 'A', color: colors.neonGreen },
              { pt: 2500, score: 31,  grade: 'B', color: '#00BFFF' },
              { pt: 800,  score: 10,  grade: 'C', color: '#FF9900' },
            ].map((ex) => (
              <View key={ex.grade} style={s.convertItem}>
                <Text style={[s.convertGrade, { color: ex.color }]}>{ex.grade}</Text>
                <View style={{ flex: 1 }}>
                  <ScoreBar pct={ex.score} color={ex.color} height={7} />
                </View>
                <Text style={[s.convertScore, { color: ex.color }]}>{ex.score} / 100</Text>
                <Text style={s.convertPt}>{ex.pt.toLocaleString()} pt</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ━━ SECTION 2: スコア計算式 ━━ */}
        <SectionHeader label="02 · SCORE FORMULA" sub="スコア計算式" />
        <FormulaBlock />

        <View style={s.card}>
          <Text style={s.cardSubHead}>BASE SCORE の内訳</Text>
          <Text style={s.cardBody}>
            <Text style={{ color: colors.neonGreen }}>横G</Text>
            {' × '}
            <Text style={{ color: colors.neonGreen }}>継続時間（秒）</Text>
            {' × '}
            <Text style={{ color: colors.neonGreen }}>速度ボーナス</Text>
            {' × '}
            <Text style={{ color: colors.neonGreen }}>傾斜補正</Text>
            {' × 100\n\n'}
            <Text style={{ color: '#00BFFF' }}>速度ボーナス</Text>
            {' = 1.0〜2.0×\n  コース参照速度に達すると最大 2倍。'}
          </Text>
        </View>

        {/* ━━ SECTION 3: 加点要素 ━━ */}
        <SectionHeader label="03 · BONUS FACTORS" sub="加点要素" />
        <View style={s.cardGap}>
          <BonusCard
            sign="+" color={colors.neonGreen} icon="⚡"
            title="横G / LATERAL G"
            sub="基礎スコア"
            detail="ドリフト中の横方向の加速度。数値が大きいほどベーススコアが増加。鋭いコーナリングで横Gを稼ごう。"
          />
          <BonusCard
            sign="+" color={colors.neonGreen} icon="⏱"
            title="継続時間 / DURATION"
            sub="基礎スコア"
            detail="ドリフトを長く維持するほどスコアが増加。高得点の基本。コントロールしながら粘れ。"
          />
          <BonusCard
            sign="+" color="#00BFFF" icon="🏎"
            title="速度 / SPEED"
            sub="最大 ×2.0"
            detail="コース別の参照速度（speedReferenceKmh）に近いほど速度ボーナスが上昇。速い！だけでは足りない、速くかつドリフトせよ。"
          />
          <BonusCard
            sign="+" color="#00BFFF" icon="📐"
            title="スリップアングル / SLIP ANGLE"
            sub="最大 ×1.5"
            detail="GPS 取得後、スリップ角 5° 以上から加算開始。大きなアングルでコーナーを攻めるほどボーナスが増える。最大 +50%。"
          />
          <BonusCard
            sign="+" color={colors.amber} icon="🔥"
            title="コンボ / COMBO CHAIN"
            sub="最大 ×3.0"
            detail="コンボ切れの有効時間（コース別）以内に次のドリフトを繋げるとコンボ数が加算される。コンボ 5 で最大 3.0× 倍率。"
          />
          <BonusCard
            sign="+" color="#FF88AA" icon="🎯"
            title="採点ゾーン / SCORING ZONE"
            sub="設定倍率による"
            detail="コースエディタで設定した採点ゾーン（コーナーなど）内でドリフトすると、ゾーン設定の倍率が掛かる。クリッピングポイントを攻略せよ。"
          />
        </View>

        {/* ━━ SECTION 4: 減点要素 ━━ */}
        <SectionHeader label="04 · PENALTY FACTORS" sub="減点要素" />
        <View style={s.cardGap}>
          <BonusCard
            sign="−" color={colors.recRed} icon="🐢"
            title="速度不足 / LOW SPEED"
            sub="速度ボーナス低下"
            detail="参照速度を大幅に下回ると速度ボーナスが 1.0×（最低値）止まりになる。遅すぎるドリフトは点数が伸びない。"
          />
          <BonusCard
            sign="−" color={colors.recRed} icon="💨"
            title="ドリフト途切れ / DRIFT BREAK"
            sub="コンボリセット"
            detail="ドリフトが途切れコンボ有効時間を超えると、コンボカウンターが 1 にリセットされる。連続して攻め続けろ。"
          />
          <BonusCard
            sign="−" color={colors.amber} icon="📉"
            title="アングル不足 / LOW ANGLE"
            sub="アングルボーナスなし"
            detail="スリップ角が 5° 未満ではアングルボーナスが発生しない（×1.0 のまま）。GPS 未取得時も同様。"
          />
          <BonusCard
            sign="−" color={colors.amber} icon="🚫"
            title="ゾーン外ドリフト / OUT OF ZONE"
            sub="ゾーン倍率なし"
            detail="採点ゾーンが設定されているコースでゾーン外でドリフトすると、ゾーン倍率は 1.0×（ボーナスなし）になる。"
          />
        </View>

        {/* ━━ SECTION 4b: 追走減点 ━━ */}
        <SectionHeader label="04 · TSUISO PENALTIES" sub="追走（Tsuiso）大会減点 — D1GP / FDJ 基準" />
        <View style={s.card}>
          <Text style={s.cardBody}>
            追走モードは近接度・角度同調・振返同調の素点（100 pt）から、大会と同様の減点を適用します。
            反則項目（スピン・エンスト・フライング等）は 0 点固定です。
          </Text>
          <View style={{ height: spacing.sm }} />
          {Object.values(TSUISO_PENALTY_RULES).map((rule) => (
            <View key={rule.code} style={s.tipRow}>
              <Text style={[s.tipNum, { color: rule.infractionLoss ? colors.recRed : colors.amber }]}>
                −{rule.deduction}
              </Text>
              <Text style={s.tipText}>
                {rule.labelJa}
                {rule.infractionLoss ? ' — 反則 0 pt' : ''}
              </Text>
            </View>
          ))}
        </View>

        {/* ━━ SECTION 5: コンボ倍率 ━━ */}
        <SectionHeader label="05 · COMBO MULTIPLIER" sub="コンボ倍率チャート" />
        <View style={s.card}>
          <Text style={s.cardBody}>
            連続ドリフトのコンボ数が増えるほど乗算される倍率が上昇。{'\n'}
            コンボの有効時間はコース設定により変化（デフォルト 3 秒）。
          </Text>
          <View style={{ height: spacing.sm }} />
          <ComboTable />
        </View>

        {/* ━━ SECTION 6: グレード評価 ━━ */}
        <SectionHeader label="06 · GRADE TABLE" sub="グレード評価基準" />

        {/* 難易度タブ */}
        <View style={s.diffTabs}>
          {DIFFICULTIES.map((d) => {
            const col = diffColors(colors)[d];
            const active = activeDiff === d;
            return (
              <GamePressable
                key={d}
                onPress={() => setActiveDiff(d)}
                style={[s.diffTab, active && { borderColor: col, backgroundColor: col + '18' }]}
              >
                <Text style={[s.diffTabText, active && { color: col }]}>
                  {DIFF_LABELS[d]}
                </Text>
              </GamePressable>
            );
          })}
        </View>

        <View style={s.card}>
          <GradeTableSection difficulty={activeDiff} />
        </View>

        {/* ━━ SECTION 7: 採点のコツ ━━ */}
        <SectionHeader label="07 · SCORING TIPS" sub="高得点を目指すには" />
        <View style={s.card}>
          {[
            { num: '01', tip: 'コーナーへの進入速度を維持する。速度ボーナスを最大化するには参照速度に近い速度を保て。' },
            { num: '02', tip: '深いアングルで攻める。スリップ角が大きいほどアングルボーナスが乗り、さらにコーナーらしいドリフトになる。' },
            { num: '03', tip: 'ドリフトを短く切らない。継続時間が長いほど BASE スコアが蓄積する。途切れる前に次のコーナーへ繋げ。' },
            { num: '04', tip: '採点ゾーン内を丁寧に通る。ゾーン設定のあるコースではクリッピングポイントを押さえることが高得点の近道。' },
            { num: '05', tip: 'コンボを切らさない。連続コーナーをインターバルなしで繋ぎ、コンボ 5 ＝ ×3.0 を維持すると爆発的にスコアが伸びる。' },
          ].map((item) => (
            <View key={item.num} style={s.tipRow}>
              <Text style={s.tipNum}>{item.num}</Text>
              <Text style={s.tipText}>{item.tip}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── スタイル ──────────────────────────────────────────────────
function createS(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({
  safe:   { flex: 1, backgroundColor: colors.background },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:{ minWidth: 60 },
  backBtnText: { ...typography.label, color: colors.neonGreen, fontSize: 9 },
  headerTitle: { flexDirection: 'row', alignItems: 'baseline' },
  title:  { ...typography.title, color: colors.textPrimary, fontSize: 14 },
  titleAccent: { ...typography.title, color: colors.neonGreen, fontSize: 14 },

  subBand:{ backgroundColor: colors.neonGreen + '10', borderBottomWidth: 1, borderBottomColor: colors.neonGreen + '22', paddingHorizontal: spacing.md, paddingVertical: 5, alignItems: 'center' },
  subBandText: { ...typography.label, color: colors.neonGreenDim, fontSize: 8, letterSpacing: 2 },

  scroll: { flex: 1 },
  content:{ padding: spacing.md, gap: spacing.lg },

  // ── セクションヘッダー
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionHeaderLine: { width: 4, height: 32, backgroundColor: colors.neonGreen, borderRadius: 2 },
  sectionHeaderBody: { gap: 2 },
  sectionHeaderLabel: { ...typography.label, color: colors.neonGreen, fontSize: 9, letterSpacing: 2.5 },
  sectionHeaderSub:   { ...typography.mono, color: colors.textMuted, fontSize: 10 },

  // ── カード
  card:   { backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  cardGap:{ gap: spacing.sm },
  cardHeadline: { ...typography.mono, color: colors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  cardSubHead:  { ...typography.label, color: colors.neonGreen, fontSize: 9 },
  cardBody:     { ...typography.mono, color: colors.textSecondary, fontSize: 11, lineHeight: 18 },

  // ── 換算イメージ
  convertBox:  { gap: 8, marginTop: spacing.sm },
  convertRow:  { borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6 },
  convertLabel:{ ...typography.mono, color: colors.textMuted, fontSize: 9 },
  convertItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  convertGrade:{ fontSize: 14, fontWeight: '900', width: 16 },
  convertScore:{ ...typography.mono, fontSize: 13, fontWeight: '700', width: 52, textAlign: 'right' },
  convertPt:   { ...typography.mono, color: colors.textMuted, fontSize: 9, width: 58, textAlign: 'right' },

  // ── 難易度タブ
  diffTabs:{ flexDirection: 'row', gap: spacing.xs },
  diffTab: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingVertical: 7, alignItems: 'center' },
  diffTabText: { ...typography.label, color: colors.textMuted, fontSize: 8 },

  // ── Tips
  tipRow:  { flexDirection: 'row', gap: spacing.sm, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  tipNum:  { ...typography.mono, color: colors.neonGreen, fontSize: 11, fontWeight: '700', width: 24 },
  tipText: { ...typography.mono, color: colors.textSecondary, fontSize: 10, flex: 1, lineHeight: 16 },
});
}

function useS() {
  const { colors, typography, spacing, gradeColor } = useTheme();
  return useMemo(
    () => createS(colors, typography, spacing),
    [colors, typography, spacing, gradeColor],
  );
}
