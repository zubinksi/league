import { useEffect, useRef } from 'react';
import { SPRITE, drawSprite } from '../lib/sprites';

/** The player, in his club's kit. Decorative — the name and position carry the
 *  meaning, so it stays out of the accessibility tree. */
export function Sprite({ position, team, size }: { position: string; team: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) drawSprite(ctx, position, team);
  }, [position, team]);
  return (
    <canvas
      ref={ref}
      className="rp-sprite"
      width={SPRITE}
      height={SPRITE}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
