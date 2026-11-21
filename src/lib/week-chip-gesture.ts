/**
 * Coarse-pointer gesture for a week-menu dish chip.
 * The touch drag sensor and its tests both use these decisions.
 *
 * - Still for HOLD_BEFORE_DRAG_MS, then release: open the recipe.
 * - Still past that hold, then move more than HOLD_MOVE_PX: drag.
 * - Move more than HOLD_MOVE_PX before the hold: scroll, nothing else.
 * - Release before the hold: the chip's existing short tap.
 */

/** How long a touch must stay within {@link HOLD_MOVE_PX} before it counts as a hold. */
export const HOLD_BEFORE_DRAG_MS = 450;

/** Movement past this distance, in CSS pixels, leaves the hold. */
export const HOLD_MOVE_PX = 8;

export type ChipGesture = "pending" | "held" | "open" | "drag" | "none";

export function decideChipGesture(input: {
  elapsedMs: number;
  distancePx: number;
  released: boolean;
  /** The drag sensor has already taken the pointer. A later release must not open. */
  dragging?: boolean;
}): ChipGesture {
  if (input.dragging) return input.released ? "none" : "drag";

  const moved = input.distancePx > HOLD_MOVE_PX;
  const held = input.elapsedMs >= HOLD_BEFORE_DRAG_MS;

  if (!held && moved) return "none";
  if (held && moved) return input.released ? "none" : "drag";
  if (held && input.released) return "open";
  if (held) return "held";
  if (input.released) return "none";
  return "pending";
}
