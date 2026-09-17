import path from "node:path";
import { expect, test } from "@playwright/test";

const sample = (name: string) => path.join(process.cwd(), "sample", name);
const fixture = (name: string) => path.join(process.cwd(), "e2e", "fixtures", name);

test("업로드 시 '일부 회로'를 선택하면 Draw 후 안내 배너가 노출된다", async ({ page }) => {
  await page.goto("/circuit");

  await page.locator('input[type="file"]').setInputFiles(sample("sample_schematic.pdf"));
  await page.getByRole("button", { name: "일부 회로" }).click();
  await page.getByRole("button", { name: "PDF에서 회로 자동 Draw" }).click();

  await expect(page.getByText("이 회로는 일부만 표시되었습니다")).toBeVisible({
    timeout: 15000,
  });
});

test("'전체 회로'를 선택해도 열린 배선 끝이 있으면 보조 경고가 표시된다", async ({ page }) => {
  await page.goto("/circuit");

  await page.locator('input[type="file"]').setInputFiles(fixture("open-wire-end.pdf"));
  // "전체 회로"가 기본 선택값이지만 명시적으로 다시 선택해 확인한다.
  await page.getByRole("button", { name: "전체 회로" }).click();
  await page.getByRole("button", { name: "PDF에서 회로 자동 Draw" }).click();

  await expect(page.getByText("연결되지 않은 배선 끝이 있습니다")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText("이 회로는 일부만 표시되었습니다")).toHaveCount(0);
});

test("애매함도 미지원 부품도 열린 배선 끝도 없으면 경고 없이 회로만 그려진다", async ({
  page,
}) => {
  await page.goto("/circuit");

  await page.locator('input[type="file"]').setInputFiles(sample("sample_schematic.pdf"));
  await page.getByRole("button", { name: "PDF에서 회로 자동 Draw" }).click();

  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
  await expect(page.getByText("연결되지 않은 배선 끝이 있습니다")).toHaveCount(0);
  await expect(page.getByText("이 회로는 일부만 표시되었습니다")).toHaveCount(0);
});
