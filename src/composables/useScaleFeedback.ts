import { gsap } from "gsap";

export interface ScaleAnimationOptions {
  duration: number;
  ease: string;
  x?: number;
  y?: number;
}

export interface UseScaleFeedbackOptions {
  hoverScale?: number;
  pressScale?: number;
  hoverDuration?: number;
  pressDuration?: number;
  targetSelector?: string;
}

export function animateScale(
  target: HTMLElement | SVGElement,
  scale: number,
  options: ScaleAnimationOptions,
) {
  gsap.to(target, {
    scale,
    ...options,
    overwrite: "auto",
  });
}

export function useScaleFeedback(options: UseScaleFeedbackOptions = {}) {
  const {
    hoverScale = 1.05,
    pressScale = 0.95,
    hoverDuration = 0.75,
    pressDuration = 0.25,
    targetSelector,
  } = options;

  const getTarget = (event: PointerEvent): HTMLElement | SVGElement => {
    const container = event.currentTarget as HTMLElement;
    return targetSelector
      ? container.querySelector<HTMLElement | SVGElement>(targetSelector)!
      : container;
  };

  const animate = (event: PointerEvent, scale: number, duration: number) => {
    const target = getTarget(event);
    animateScale(target, scale, { duration, ease: "elastic.out" });
  };

  return {
    handlePointerEnter: (event: PointerEvent) =>
      animate(event, hoverScale, hoverDuration),
    handlePointerLeave: (event: PointerEvent) => {
      const target = getTarget(event);
      animateScale(target, 1, { duration: 0.5, ease: "back.out" });
    },
    handlePointerDown: (event: PointerEvent) =>
      animateScale(getTarget(event), pressScale, {
        duration: pressDuration,
        ease: "power1.out",
      }),
    handlePointerUp: (event: PointerEvent) =>
      animate(event, hoverScale, hoverDuration),
  };
}
