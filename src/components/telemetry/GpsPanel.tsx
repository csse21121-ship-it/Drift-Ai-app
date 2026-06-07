import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

import { TelemetryFrame } from '@/components/ui/TelemetryFrame';

import { formatCoord, formatHeading, formatSpeed } from '@/lib/gps';
import { formatGradeDisplay, gradeDirectionLabel } from '@/lib/gradeDetector';

import { gpsQualityLabel, type GpsMonitorState } from '@/lib/gpsAccuracyMonitor';


import type { GpsSample, GradeSnapshot } from '@/types/telemetry';



type GpsPanelProps = {

  gps: GpsSample | null;

  isActive: boolean;

  gpsMonitor?: GpsMonitorState;

  grade?: GradeSnapshot | null;

};



export function GpsPanel({ gps, isActive, gpsMonitor, grade = null }: GpsPanelProps) {
  const styles = useStyles();

  const hasSignal = !!gps;

  const quality = gpsMonitor?.quality ?? 'unknown';

  const isRelaxed = gpsMonitor?.isRelaxed ?? false;

  const smoothed = gpsMonitor?.smoothedAccuracyM;



  const accuracyText = (() => {

    if (!gps) return '◌ SEARCHING SATELLITES…';

    const accM = smoothed != null ? Math.round(smoothed) : Math.round(gps.accuracy);

    const qLabel = isActive ? gpsQualityLabel(quality) : '';

    const relaxed = isActive && isRelaxed ? ' · 閾値緩和' : '';

    const lock = isActive && hasSignal ? ' LOCKED' : hasSignal ? ' ACQUIRING' : '';

    return `±${accM}m${qLabel ? ` ${qLabel}` : ''}${relaxed}${lock}`;

  })();



  const gradeText = (() => {
    if (!isActive || !grade || grade.confidence < 20) return '---';
    return `${gradeDirectionLabel(grade.direction)} · ${formatGradeDisplay(grade)}`;
  })();



  return (

    <TelemetryFrame style={styles.container}>

      <View style={styles.labelBar}>

        <View style={styles.labelLeft}>

          <View style={[

            styles.sigDot,

            hasSignal && styles.sigDotOn,

            isRelaxed && styles.sigDotWarn,

          ]} />

          <Text style={[styles.label, hasSignal && styles.labelOn]}>GPS</Text>

        </View>

        <Text style={[

          styles.subLabel,

          !hasSignal && styles.subLabelWarn,

          isRelaxed && styles.subLabelRelaxed,

        ]}>

          {accuracyText}

        </Text>

      </View>



      <View style={styles.speedRow}>

        <Text style={styles.speedLabel}>SPEED</Text>

        <Text style={[styles.speedValue, !hasSignal && styles.speedValueOff]}>

          {gps ? formatSpeed(gps.speedKmh) : '- -.-'}

          <Text style={styles.speedUnit}> km/h</Text>

        </Text>

      </View>



      <View style={styles.grid}>

        <Cell label="HEADING"

              value={gps ? formatHeading(gps.heading) : '--- °'}

              dimmed={!hasSignal} />

        <Cell label="ALT"

              value={gps
                ? `${Math.round(gps.altitude)} m${gps.altitudeSource === 'baro_fusion' ? ' · BARO' : ''}`
                : '--- m'}

              dimmed={!hasSignal} />

        <Cell label="GRADE"

              value={gradeText}

              dimmed={!isActive || !grade || grade.confidence < 20} />

        <Cell label="LAT"

              value={gps ? formatCoord(gps.latitude) : '◌◌.◌◌◌◌◌'}

              wide dimmed={!hasSignal} />

        <Cell label="LON"

              value={gps ? formatCoord(gps.longitude) : '◌◌◌.◌◌◌◌◌'}

              wide dimmed={!hasSignal} />

      </View>

    </TelemetryFrame>

  );

}



function Cell({

  label,

  value,

  wide = false,

  dimmed = false,

}: {

  label: string;

  value: string;

  wide?: boolean;

  dimmed?: boolean;

}) {
  const styles = useStyles();

  return (

    <View style={[styles.cell, wide && styles.cellWide]}>

      <Text style={styles.cellLabel}>{label}</Text>

      <Text style={[styles.cellValue, dimmed && styles.cellValueDim]}>{value}</Text>

    </View>

  );

}



function createStyles(colors: import('@/constants/uiThemes').ThemeColors, typography: import('@/constants/uiThemes').AppTypography, spacing: typeof import('@/constants/theme').spacing) {
  return StyleSheet.create({

  container: {

    marginHorizontal: spacing.md,

    marginTop: spacing.sm,

  },

  labelBar: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'center',

    paddingHorizontal: spacing.md,

    paddingVertical: spacing.sm,

    borderBottomWidth: 1,

    borderBottomColor: colors.border,

  },

  labelLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },

  sigDot: {

    width: 6, height: 6, borderRadius: 3,

    backgroundColor: colors.textMuted,

  },

  sigDotOn: { backgroundColor: colors.neonGreen },

  sigDotWarn: { backgroundColor: colors.amber },

  label: {

    ...typography.label,

    color: colors.textMuted,

  },

  labelOn: { color: colors.neonGreen },

  subLabel: {

    ...typography.label,

    color: colors.textMuted,

    fontSize: 8,

    flexShrink: 1,

    textAlign: 'right',

    marginLeft: spacing.xs,

  },

  subLabelWarn: { color: colors.amber },

  subLabelRelaxed: { color: colors.amber },

  speedRow: {

    flexDirection: 'row',

    justifyContent: 'space-between',

    alignItems: 'baseline',

    paddingHorizontal: spacing.md,

    paddingVertical: spacing.md,

    borderBottomWidth: 1,

    borderBottomColor: colors.border,

  },

  speedLabel: {

    ...typography.label,

    color: colors.textMuted,

    fontSize: 8,

  },

  speedValue: {

    ...typography.mono,

    color: colors.neonGreen,

    fontSize: 28,

    fontWeight: '700',

  },

  speedValueOff: { color: colors.textMuted },

  speedUnit: {

    fontSize: 12,

    color: colors.textSecondary,

    fontWeight: '400',

  },

  grid: {

    flexDirection: 'row',

    flexWrap: 'wrap',

  },

  cell: {

    width: '50%',

    paddingHorizontal: spacing.md,

    paddingVertical: spacing.sm,

    borderBottomWidth: 1,

    borderRightWidth: 1,

    borderColor: colors.border,

  },

  cellWide: {

    width: '100%',

    borderRightWidth: 0,

  },

  cellLabel: {

    ...typography.label,

    color: colors.textMuted,

    fontSize: 8,

    marginBottom: 4,

  },

  cellValue: {

    ...typography.mono,

    color: colors.textPrimary,

    fontSize: 13,

  },

  cellValueDim: { color: colors.textMuted },

});
}

function useStyles() {
  const { colors, typography, spacing } = useTheme();
  return useMemo(
    () => createStyles(colors, typography, spacing),
    [colors, typography, spacing],
  );
}


