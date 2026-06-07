import { isCalibrated, type CalibrationData } from '@/lib/calibration';
import type { MountOrientationOverride } from '@/types/settings';

export type SetupWarning = {
  id: 'mount_auto' | 'not_calibrated';
  text: string;
};

export function getSetupWarnings(
  mountOverride: MountOrientationOverride,
  calibration: CalibrationData | null,
): SetupWarning[] {
  const warnings: SetupWarning[] = [];

  if (mountOverride === 'auto') {
    warnings.push({
      id: 'mount_auto',
      text: 'WARN · MOUNT AUTO — FIX ORIENTATION IN SETTINGS',
    });
  }

  if (!calibration || !isCalibrated(calibration)) {
    warnings.push({
      id: 'not_calibrated',
      text: 'WARN · CALIB NOT SET — RUN CALIBRATE FIRST',
    });
  }

  return warnings;
}
