import { MenuInputError } from "@/server/week";

export function validateCustomName(value: unknown): string {
  if (typeof value !== "string") throw new MenuInputError("名称不能为空。");
  const name = value.trim();
  if (name.length < 1 || name.length > 40) {
    throw new MenuInputError("名称须为 1–40 个字。");
  }
  return name;
}

export function customNameKey(name: string): string {
  return name.trim().toLowerCase();
}
