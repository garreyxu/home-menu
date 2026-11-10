import { describe, expect, it } from "vitest";
import { displayField, placeholderInitials } from "@/lib/display";

describe("displayField", () => {
  it.each([null, undefined, "", " ", "\t\n", "N/A", "n/a", "NA", "-", " N/A "])(
    "hides empty metadata %j",
    (value) => expect(displayField(value)).toBeNull(),
  );
  it.each(["鸡蛋", "30 minutes", "0", " N/A sauce "])(
    "preserves normal values %j",
    (value) => expect(displayField(value)).toBe(value),
  );
  it.each(["option", " Option "])("hides default select label %j", (value) => {
    expect(displayField(value)).toBeNull();
  });
});

describe("placeholderInitials", () => {
  it.each([
    ["秘制蜜汁叉烧配手工鸡蛋面条", "秘制"],
    ["English dish", "En"],
    ["👩🏽‍🍳🍜晚餐", "👩🏽‍🍳🍜"],
    ["éclair", "éc"],
    ["汤", "汤"],
    ["A", "A"],
    ["🍜", "🍜"],
    [" 汤 ", "汤"],
    ["", ""],
  ])("takes two graphemes from %j", (name, initials) => {
    expect(placeholderInitials(name)).toBe(initials);
  });
});
