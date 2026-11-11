import { test, expect } from "@playwright/test";
import { slotButton } from "./slots";

test("slot buttons match filled, empty and disabled labels within their scope", async ({
  page,
}) => {
  await page.setContent(`
    <section aria-label="board">
      <button aria-label="周二晚餐">filled</button>
      <button aria-label="周二晚餐，还没点菜，点按加菜">empty</button>
      <button aria-label="周二晚餐，这顿已经有了" aria-disabled="true">duplicate</button>
      <button aria-label="周二午餐">other meal</button>
      <button aria-label="周三晚餐">other day</button>
      <button aria-label="从周二晚餐移除红烧肉">remove</button>
      <button aria-label="周二晚餐后">different name</button>
    </section>
    <button aria-label="周二晚餐">outside</button>
  `);
  const board = page.getByRole("region", { name: "board" });
  await expect(slotButton(board, "周二晚餐")).toHaveText([
    "filled",
    "empty",
    "duplicate",
  ]);
  await expect(slotButton(page, "周二午餐")).toHaveText("other meal");
});
