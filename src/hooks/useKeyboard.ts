import { useState, useEffect } from 'react';
import { isNative } from '@/lib/capacitor';

/**
 * Hook to track keyboard visibility and height
 *
 * @example
 * const { isVisible, keyboardHeight } = useKeyboard();
 *
 * return (
 *   <div style={{ paddingBottom: isVisible ? keyboardHeight : 0 }}>
 *     <input />
 *   </div>
 * );
 */
export const useKeyboard = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!isNative()) return;

    const handleShow = (event: CustomEvent<{ height: number }>) => {
      setIsVisible(true);
      setKeyboardHeight(event.detail.height);
    };

    const handleHide = () => {
      setIsVisible(false);
      setKeyboardHeight(0);
    };

    window.addEventListener('keyboard:show', handleShow as EventListener);
    window.addEventListener('keyboard:hide', handleHide as EventListener);

    return () => {
      window.removeEventListener('keyboard:show', handleShow as EventListener);
      window.removeEventListener('keyboard:hide', handleHide as EventListener);
    };
  }, []);

  return { isVisible, keyboardHeight };
};
