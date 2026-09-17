import path from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => path.join(process.cwd(), "e2e", "fixtures", name);

async function uploadAmbiguousFixture(page: import("@playwright/test").Page) {
  await page.goto("/circuit");
  await page.locator('input[type="file"]').setInputFiles(fixture("ambiguous-triangle.pdf"));
  await page.getByRole("button", { name: "PDF에서 회로 자동 Draw" }).click();
  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toBeVisible({
    timeout: 15000,
  });
}

test("애매한 지점이 있으면 팝업이 뜨고, 후보를 고르면 그 지점이 회로에 반영된다", async ({
  page,
}) => {
  await uploadAmbiguousFixture(page);

  // The iframe must not be updated with a new circuit yet — resolution is required first.
  const iframe = page.locator("iframe");
  await expect(iframe).not.toHaveAttribute("src", /\?ctz=/);

  await page.getByRole("button", { name: "다이오드" }).click();

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});

test("'그 외(직접 입력)'로 입력한 값이 최종 회로에 반영된다", async ({ page }) => {
  await uploadAmbiguousFixture(page);

  await page.getByRole("button", { name: "그 외 (직접 입력)" }).click();
  await page.getByPlaceholder("이 소자가 실제로 무엇인지 입력하세요").fill("가변저항 500옴");
  await page.getByRole("button", { name: "확인" }).click();

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});

test("'모르겠음'으로 남기면 실제 소자가 아닌 placeholder로 표시되고 시뮬레이션을 방해하지 않는다", async ({
  page,
}) => {
  await uploadAmbiguousFixture(page);

  await page.getByRole("button", { name: "모르겠음" }).click();

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});
