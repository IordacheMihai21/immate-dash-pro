import { useEffect, useRef, type ReactNode } from "react";
import { createAnimatable } from "animejs";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface MagneticProps {
  children: ReactNode;
  className?: string;
  /** How far the cursor can be from the center before the pull engages, in px. */
  range?: number;
  /** Fraction of the cursor offset applied as pull, 0-1. */
  strength?: number;
}

export function Magnetic({ children, className, range = 64, strength = 0.35 }: MagneticProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;

    if (!el || reduce) {
      return;
    }

    const animatable = createAnimatable(el, { x: 280, y: 280, ease: "out(3)" });

    const onMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;

      if (Math.hypot(dx, dy) < range) {
        animatable.x(dx * strength);
        animatable.y(dy * strength);
      } else {
        animatable.x(0);
        animatable.y(0);
      }
    };

    const reset = () => {
      animatable.x(0);
      animatable.y(0);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("blur", reset);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("blur", reset);
      animatable.revert();
    };
  }, [reduce, range, strength]);

  return (
    <div ref={ref} className={cn("inline-block will-change-transform", className)}>
      {children}
    </div>
  );
}
