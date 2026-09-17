import { expect, test } from "@playwright/test";

test("홈 화면이 열리고 회로 시뮬레이터 제목이 보인다", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("회로 시뮬레이터");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "회로 시뮬레이터"
  );
});
