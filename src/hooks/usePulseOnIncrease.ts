import { useEffect, useRef, useState } from 'react';

/**
 * Returns a counter that increments whenever `value` increases relative to the
 * previous render — never on mount. Use it as a React `key` to restart a
 * one-shot CSS animation (livetick / scoreflash / endpulse) only on the tick
 * where the value actually changed.
 */
export function usePulseOnIncrease(value: number | null | undefined): number {
  const prev = useRef(value);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (typeof value === 'number' && typeof prev.current === 'number' && value > prev.current + 1e-9) {
      setPulse((p) => p + 1);
    }
    prev.current = value;
  }, [value]);
  return pulse;
}
