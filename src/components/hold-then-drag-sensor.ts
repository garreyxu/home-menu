import {
  TouchSensor,
  type DraggableNode,
  type SensorProps,
  type TouchSensorOptions,
  type UniqueIdentifier,
} from "@dnd-kit/core";

import {
  HOLD_BEFORE_DRAG_MS,
  HOLD_MOVE_PX,
  decideChipGesture,
} from "@/lib/week-chip-gesture";

export type HoldThenDragOptions = TouchSensorOptions & {
  onHeld?: (id: UniqueIdentifier) => void;
  onOpen?: (id: UniqueIdentifier) => void;
};

type Point = { x: number; y: number };

/**
 * Runtime shape of dnd-kit's pointer sensor. The public delay constraint
 * starts a drag as soon as the timer fires; a still release has to open the
 * recipe instead, so the touch listeners are replaced after construction.
 */
type HoldSensor = {
  timeoutId: number | null;
  activated: boolean;
  initialCoordinates: Point | null;
  listeners: {
    add(
      name: string,
      handler: (event: TouchEvent) => void,
      options?: AddEventListenerOptions,
    ): void;
    removeAll(): void;
  };
  handleStart: () => void;
  handleEnd: () => void;
  handleCancel: () => void;
  props: SensorProps<HoldThenDragOptions> & {
    activeNode: DraggableNode;
  };
};

function touchPoint(event: TouchEvent): Point | null {
  const touch = event.changedTouches[0] ?? event.touches[0];
  if (!touch) return null;
  return { x: touch.clientX, y: touch.clientY };
}

function distance(origin: Point | null, point: Point | null): number {
  if (!origin || !point) return 0;
  return Math.hypot(point.x - origin.x, point.y - origin.y);
}

function suppressClick(sensor: HoldSensor) {
  sensor.props.activeNode.node.current?.setAttribute("data-suppress-click", "");
}

/** The click that follows a touch can land on whatever opened during touchend. */
function suppressFollowingClick(guard: { current: boolean }) {
  if (guard.current) return;
  guard.current = true;
  const stop = (event: Event) => {
    // Programmatic clicks, such as test cleanup, are not the ghost click.
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  };
  const finish = () => {
    document.removeEventListener("click", stop, true);
    window.clearTimeout(timer);
  };
  document.addEventListener("click", stop, true);
  const timer = window.setTimeout(finish, 1000);
}

function armHoldThenDrag(sensor: HoldSensor) {
  if (sensor.timeoutId != null) window.clearTimeout(sensor.timeoutId);
  sensor.timeoutId = null;
  // Drop the delay listener that would cancel any movement after the timer
  // and the timer that would start a drag with no movement.
  sensor.listeners.removeAll();

  const origin = sensor.initialCoordinates;
  const startedAt = performance.now();
  let latest: Point | null = origin;
  let thresholdReached = false;
  const clickGuard = { current: false };

  const elapsed = () => {
    const ms = performance.now() - startedAt;
    return thresholdReached ? Math.max(HOLD_BEFORE_DRAG_MS, ms) : ms;
  };

  sensor.listeners.add(
    "touchmove",
    (event) => {
      const point = touchPoint(event);
      if (point) latest = point;
      const decision = decideChipGesture({
        elapsedMs: elapsed(),
        distancePx: distance(origin, point ?? latest),
        released: false,
        dragging: sensor.activated,
      });
      if (decision === "none") {
        sensor.handleCancel();
        return;
      }
      if (decision === "drag" && !sensor.activated) {
        if (event.cancelable) event.preventDefault();
        suppressClick(sensor);
        suppressFollowingClick(clickGuard);
        sensor.handleStart();
        // DragStart lands in this event. Later touchmove events carry the point
        // once React has recorded the drag.
        return;
      }
      if (sensor.activated && point) {
        if (event.cancelable) event.preventDefault();
        sensor.props.onMove(point);
      }
    },
    { passive: false },
  );

  sensor.listeners.add("touchend", (event) => {
    const point = touchPoint(event);
    if (point) latest = point;
    if (sensor.activated && point) sensor.props.onMove(point);
    const decision = decideChipGesture({
      elapsedMs: elapsed(),
      distancePx: distance(origin, point ?? latest),
      released: true,
      dragging: sensor.activated,
    });
    if (decision === "open") sensor.props.options.onOpen?.(sensor.props.active);
    sensor.handleEnd();
  });

  sensor.listeners.add("touchcancel", () => {
    sensor.handleCancel();
  });

  sensor.timeoutId = window.setTimeout(() => {
    sensor.timeoutId = null;
    const decision = decideChipGesture({
      elapsedMs: HOLD_BEFORE_DRAG_MS,
      distancePx: distance(origin, latest),
      released: false,
      dragging: sensor.activated,
    });
    if (decision !== "held") return;
    thresholdReached = true;
    suppressClick(sensor);
    suppressFollowingClick(clickGuard);
    sensor.props.options.onHeld?.(sensor.props.active);
  }, HOLD_BEFORE_DRAG_MS);
}

/**
 * Touch drag for week-menu chips. A still hold arms the recipe; only a move
 * after that hold starts the same dnd-kit drag PointerSensor uses for a mouse.
 * Mouse and keyboard sensors are unchanged.
 */
export class HoldThenDragSensor extends TouchSensor {
  static activators = TouchSensor.activators;

  constructor(props: SensorProps<HoldThenDragOptions>) {
    props.options.activationConstraint = {
      delay: HOLD_BEFORE_DRAG_MS,
      tolerance: HOLD_MOVE_PX,
    };
    super(props);
    armHoldThenDrag(this as unknown as HoldSensor);
  }
}
