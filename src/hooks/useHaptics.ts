import { useCallback } from 'react';
import {
  hapticLight,
  hapticMedium,
  hapticHeavy,
  hapticSuccess,
  hapticWarning,
  hapticError,
  hapticSelection,
} from '@/lib/capacitor/haptics';

/**
 * Hook for easy haptic feedback usage in components
 *
 * @example
 * const { light, medium, heavy, success, warning, error, selection } = useHaptics();
 *
 * // On button press
 * <button onClick={() => { medium(); doAction(); }}>Action</button>
 *
 * // On successful operation
 * const handleSave = async () => {
 *   await saveData();
 *   success();
 * };
 */
export const useHaptics = () => {
  const light = useCallback(() => hapticLight(), []);
  const medium = useCallback(() => hapticMedium(), []);
  const heavy = useCallback(() => hapticHeavy(), []);
  const success = useCallback(() => hapticSuccess(), []);
  const warning = useCallback(() => hapticWarning(), []);
  const error = useCallback(() => hapticError(), []);
  const selection = useCallback(() => hapticSelection(), []);

  return {
    light,
    medium,
    heavy,
    success,
    warning,
    error,
    selection,
  };
};
