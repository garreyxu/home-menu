import type { SensorProps, UniqueIdentifier } from "@dnd-kit/core";

import {
  HOLD_BEFORE_DRAG_MS,
  decideChipGesture,
} from "@/lib/week-chip-gesture";

export type HoldThenDragOptions = {
  onHeld?: (id: UniqueIdentifier) => void;
  onOpen?: (id: UniqueIdentifier) => void;
  onActivation?({ event }: { event: Event }): void;
};

type Point = { x: number; y: number };

/**
 * Touch sensor for week-menu chips. Built on dnd-kit's public sensor API:
 * static activators plus onStart / onMove / onEnd / onCancel / onAbort.
 * A still hold opens the recipe; only a later move starts the drag.
 * Mouse and keyboard sensors are unchanged.
 */
export class HoldThenDragSensor {
  autoScrollEnabled = true;

  static activators = [
    {
      eventName: "onTouchStart" as const,
      handler(
        event: { nativeEvent: Event },
        options: HoldThenDragOptions,
      ): boolean {
        const native = event.nativeEvent;
        if (!(native instanceof TouchEvent) || native.touches.length !== 1) {
          return false;
        }
        options.onActivation?.({ event: native });
        return true;
      },
    },
  ];

  /**
   * iOS ignores preventDefault on a touchmove listener added after the gesture
   * starts unless some non-passive touchmove listener already exists.
   */
  static setup(): () => void {
    const noop = () => {};
    window.addEventListener("touchmove", noop, {
      capture: false,
      passive: false,
    });
    return () => window.removeEventListener("touchmove", noop);
  }

  constructor(props: SensorProps<HoldThenDragOptions>) {
    const native = props.event;
    if (!(native instanceof TouchEvent)) {
      props.onAbort(props.active);
      props.onCancel();
      return;
    }
    const origin = touchPoint(native);
    if (!origin) {
      props.onAbort(props.active);
      props.onCancel();
      return;
    }

    const doc =
      (native.target instanceof Node ? native.target.ownerDocument : null) ??
      document;
    const startedAt = performance.now();
    let latest = origin;
    let started = false;
    let finished = false;
    let thresholdReached = false;
    const clickGuard = { current: false };
    let timer = 0;

    const elapsed = () => {
      const ms = performance.now() - startedAt;
      return thresholdReached ? Math.max(HOLD_BEFORE_DRAG_MS, ms) : ms;
    };

    const detach = () => {
      window.clearTimeout(timer);
      doc.removeEventListener("touchmove", onTouchMove);
      doc.removeEventListener("touchend", onTouchEnd);
      doc.removeEventListener("touchcancel", onTouchCancel);
    };

    const finish = (kind: "end" | "cancel") => {
      if (finished) return;
      finished = true;
      detach();
      if (!started) props.onAbort(props.active);
      if (kind === "end") props.onEnd();
      else props.onCancel();
    };

    const onTouchMove = (event: TouchEvent) => {
      const point = touchPoint(event) ?? latest;
      latest = point;
      const decision = decideChipGesture({
        elapsedMs: elapsed(),
        distancePx: distance(origin, point),
        released: false,
        dragging: started,
      });
      if (decision === "none") {
        finish("cancel");
        return;
      }
      if (decision === "drag" && !started) {
        if (event.cancelable) event.preventDefault();
        suppressClick(props);
        suppressFollowingClick(clickGuard);
        started = true;
        props.onStart(origin);
        return;
      }
      if (started) {
        if (event.cancelable) event.preventDefault();
        props.onMove(point);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      const point = touchPoint(event) ?? latest;
      latest = point;
      if (started) props.onMove(point);
      const decision = decideChipGesture({
        elapsedMs: elapsed(),
        distancePx: distance(origin, point),
        released: true,
        dragging: started,
      });
      if (decision === "open") props.options.onOpen?.(props.active);
      finish("end");
    };

    const onTouchCancel = () => finish("cancel");

    doc.addEventListener("touchmove", onTouchMove, { passive: false });
    doc.addEventListener("touchend", onTouchEnd);
    doc.addEventListener("touchcancel", onTouchCancel);

    timer = window.setTimeout(() => {
      const decision = decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS,
        distancePx: distance(origin, latest),
        released: false,
        dragging: started,
      });
      if (decision !== "held" || finished) return;
      thresholdReached = true;
      suppressClick(props);
      suppressFollowingClick(clickGuard);
      props.options.onHeld?.(props.active);
    }, HOLD_BEFORE_DRAG_MS);
  }
}

function touchPoint(event: TouchEvent): Point | null {
  const touch = event.changedTouches[0] ?? event.touches[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

function distance(origin: Point, point: Point): number {
  return Math.hypot(point.x - origin.x, point.y - origin.y);
}

function suppressClick(props: SensorProps<HoldThenDragOptions>) {
  props.activeNode.node.current?.setAttribute("data-suppress-click", "");
}

/**
 * The click synthesized from the touch can land on the sheet that just opened.
 * A later tap starts with its own pointerdown, so it is left alone.
 */
function suppressFollowingClick(guard: { current: boolean }) {
  if (guard.current) return;
  guard.current = true;
  let fromThisTouch = true;
  const disarm = () => {
    fromThisTouch = false;
  };
  const stop = (event: Event) => {
    if (!fromThisTouch || !event.isTrusted) return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  };
  const finish = () => {
    document.removeEventListener("click", stop, true);
    document.removeEventListener("pointerdown", disarm, true);
    window.clearTimeout(timer);
  };
  document.addEventListener("pointerdown", disarm, true);
  document.addEventListener("click", stop, true);
  const timer = window.setTimeout(finish, 1000);
}
