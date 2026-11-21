import { describe, expect, it } from "vitest";

import {
  HOLD_BEFORE_DRAG_MS,
  HOLD_MOVE_PX,
  decideChipGesture,
} from "@/lib/week-chip-gesture";

describe("week chip touch gesture", () => {
  it("uses a 450ms hold and an 8px move", () => {
    expect(HOLD_BEFORE_DRAG_MS).toBe(450);
    expect(HOLD_MOVE_PX).toBe(8);
  });

  it("opens when a hold is released without moving", () => {
    expect(
      decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS,
        distancePx: 0,
        released: true,
      }),
    ).toBe("open");
    expect(
      decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS + 40,
        distancePx: HOLD_MOVE_PX,
        released: true,
      }),
    ).toBe("open");
  });

  it("drags when the pointer moves after the hold", () => {
    expect(
      decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS,
        distancePx: HOLD_MOVE_PX + 0.1,
        released: false,
      }),
    ).toBe("drag");
    expect(
      decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS + 200,
        distancePx: 40,
        released: true,
        dragging: true,
      }),
    ).toBe("none");
  });

  it("does nothing when the pointer moves before the hold", () => {
    expect(
      decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS - 1,
        distancePx: HOLD_MOVE_PX + 0.1,
        released: false,
      }),
    ).toBe("none");
    expect(
      decideChipGesture({
        elapsedMs: 80,
        distancePx: 24,
        released: true,
      }),
    ).toBe("none");
  });

  it("keeps a short tap and the in-between hold distinct", () => {
    expect(
      decideChipGesture({
        elapsedMs: 120,
        distancePx: 1,
        released: true,
      }),
    ).toBe("none");
    expect(
      decideChipGesture({
        elapsedMs: HOLD_BEFORE_DRAG_MS,
        distancePx: 2,
        released: false,
      }),
    ).toBe("held");
    expect(
      decideChipGesture({
        elapsedMs: 10,
        distancePx: 0,
        released: false,
      }),
    ).toBe("pending");
  });
});
