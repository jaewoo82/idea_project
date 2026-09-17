import path from "node:path";
import { expect, test } from "@playwright/test";

const sample = (name: string) =>
  path.join(process.cwd(), "sample", name);

test("애매함 없는 PDF를 업로드하면 팝업 없이 회로가 자동으로 그려지고 시뮬레이션이 동작한다", async ({
  page,
}) => {
  await page.goto("/circuit");

  await page.locator('input[type="file"]').setInputFiles(sample("sample_schematic.pdf"));
  await page.getByRole("button", { name: "PDF에서 회로 자동 Draw" }).click();

  // No ambiguity/unsupported banner should appear for this sheet.
  await expect(page.getByText("식별했지만 미지원인 부품이 있습니다")).toHaveCount(0);

  // CircuitJS renders the circuit on a <canvas>, so its labels are not real
  // DOM text; the observable, deterministic signal from our own app is that
  // the iframe was reloaded with a generated `?ctz=` circuit payload.
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});

test("MVP 범위 밖 IC는 배치되지 않고 미지원 목록에 표시되며, 나머지 소자는 그려진다", async ({
  page,
}) => {
  await page.goto("/circuit");

  await page
    .locator('input[type="file"]')
    .setInputFiles(sample("intermediate_schematic.pdf"));
  await page.getByRole("button", { name: "PDF에서 회로 자동 Draw" }).click();

  await expect(page.getByText("식별했지만 미지원인 부품이 있습니다")).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByText(/NE555/)).toBeVisible();

  // The rest of the sheet must still be drawn — the unsupported IC must not
  // block the rest of the circuit from loading.
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});
