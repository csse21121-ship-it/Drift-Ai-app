/**
 * 気圧計 — GPS 標高との融合
 *
 * 気圧の相対変化は GPS 標高より高周波・低ノイズ。
 * セッション開始時に GPS でアンカーし、走行中は気圧デルタを主信号、
 * GPS で長期ドリフトを緩やかに補正する。
 */

const GPS_ANCHOR_ALPHA = 0.08;
const FUSED_GPS_BLEND = 0.12;

/** 気圧 (hPa) 差からの標高変化 (m) */
export function altitudeDeltaFromPressure(
  pressureHpa: number,
  refPressureHpa: number,
): number {
  if (pressureHpa <= 0 || refPressureHpa <= 0) return 0;
  return 44330 * (1 - Math.pow(pressureHpa / refPressureHpa, 0.190263));
}

export type BarometricFusionSnapshot = {
  active: boolean;
  fusedAltitudeM: number | null;
  rawGpsAltitudeM: number | null;
  pressureHpa: number | null;
};

export class BarometricAltitudeFusion {
  private refPressureHpa: number | null = null;
  private anchorGpsAltM: number | null = null;
  private iosRelativeOffsetM: number | null = null;
  private lastRelativeAltM: number | null = null;
  private fusedAltM: number | null = null;
  private lastGpsAltM: number | null = null;
  private lastPressureHpa: number | null = null;
  private baroSampleCount = 0;

  reset(): void {
    this.refPressureHpa = null;
    this.anchorGpsAltM = null;
    this.iosRelativeOffsetM = null;
    this.lastRelativeAltM = null;
    this.fusedAltM = null;
    this.lastGpsAltM = null;
    this.lastPressureHpa = null;
    this.baroSampleCount = 0;
  }

  getSnapshot(): BarometricFusionSnapshot {
    return {
      active: this.isActive(),
      fusedAltitudeM: this.fusedAltM,
      rawGpsAltitudeM: this.lastGpsAltM,
      pressureHpa: this.lastPressureHpa,
    };
  }

  isActive(): boolean {
    return this.baroSampleCount >= 2 && this.fusedAltM != null;
  }

  updateBarometer(pressure: number, relativeAltitude?: number): number | null {
    if (!Number.isFinite(pressure) || pressure <= 0) {
      return this.fusedAltM;
    }

    this.lastPressureHpa = pressure;
    this.baroSampleCount += 1;

    if (this.refPressureHpa == null) {
      this.refPressureHpa = pressure;
    }

    if (relativeAltitude != null && Number.isFinite(relativeAltitude)) {
      this.lastRelativeAltM = relativeAltitude;
      if (this.iosRelativeOffsetM != null) {
        this.fusedAltM = this.iosRelativeOffsetM + relativeAltitude;
        return this.fusedAltM;
      }
      if (this.anchorGpsAltM != null) {
        this.iosRelativeOffsetM = this.anchorGpsAltM - relativeAltitude;
        this.fusedAltM = this.anchorGpsAltM;
        return this.fusedAltM;
      }
      return this.fusedAltM;
    }

    if (this.anchorGpsAltM == null || this.refPressureHpa == null) {
      return this.fusedAltM;
    }

    const delta = altitudeDeltaFromPressure(pressure, this.refPressureHpa);
    this.fusedAltM = this.anchorGpsAltM + delta;
    return this.fusedAltM;
  }

  updateGps(gpsAltitudeM: number, accuracyM: number): number {
    this.lastGpsAltM = gpsAltitudeM;

    if (!Number.isFinite(gpsAltitudeM) || gpsAltitudeM === 0) {
      return this.fusedAltM ?? gpsAltitudeM;
    }

    if (this.anchorGpsAltM == null) {
      this.anchorGpsAltM = gpsAltitudeM;
      if (this.refPressureHpa == null && this.lastPressureHpa != null) {
        this.refPressureHpa = this.lastPressureHpa;
      }
      if (this.lastRelativeAltM != null && this.iosRelativeOffsetM == null) {
        this.iosRelativeOffsetM = gpsAltitudeM - this.lastRelativeAltM;
      }
      this.fusedAltM =
        this.lastRelativeAltM != null && this.iosRelativeOffsetM != null
          ? this.iosRelativeOffsetM + this.lastRelativeAltM
          : gpsAltitudeM;
      return this.fusedAltM;
    }

    if (this.baroSampleCount < 2 || this.lastPressureHpa == null) {
      this.fusedAltM = gpsAltitudeM;
      this.anchorGpsAltM = gpsAltitudeM;
      return gpsAltitudeM;
    }

    const trust =
      accuracyM > 0
        ? Math.max(0.03, Math.min(0.14, 0.16 - accuracyM / 280))
        : GPS_ANCHOR_ALPHA;

    const baroAlt = this.computeBaroAltitude();
    if (baroAlt != null) {
      const gpsError = gpsAltitudeM - baroAlt;
      this.anchorGpsAltM += trust * gpsError;
      const recalc = this.computeBaroAltitude();
      if (recalc != null) {
        this.fusedAltM =
          (1 - FUSED_GPS_BLEND) * recalc + FUSED_GPS_BLEND * gpsAltitudeM;
      }
    } else {
      this.fusedAltM =
        this.fusedAltM == null
          ? gpsAltitudeM
          : (1 - trust) * this.fusedAltM + trust * gpsAltitudeM;
    }

    return this.fusedAltM ?? gpsAltitudeM;
  }

  private computeBaroAltitude(): number | null {
    if (this.lastRelativeAltM != null && this.iosRelativeOffsetM != null) {
      return this.iosRelativeOffsetM + this.lastRelativeAltM;
    }
    if (
      this.anchorGpsAltM != null &&
      this.refPressureHpa != null &&
      this.lastPressureHpa != null
    ) {
      return (
        this.anchorGpsAltM +
        altitudeDeltaFromPressure(this.lastPressureHpa, this.refPressureHpa)
      );
    }
    return null;
  }
}
