import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => path.join(process.cwd(), "e2e", "fixtures", name);

async function pasteImage(page: import("@playwright/test").Page, filePath: string) {
  const base64 = readFileSync(filePath).toString("base64");
  await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], "capture.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    document.body.dispatchEvent(event);
  }, base64);
}

async function pasteText(page: import("@playwright/test").Page, text: string) {
  await page.evaluate((t) => {
    const dt = new DataTransfer();
    dt.items.add(t, "text/plain");
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });
    document.body.dispatchEvent(event);
  }, text);
}

test("클립보드 이미지를 Ctrl+V로 붙여넣으면 확신 있는 소자는 팝업 없이 자동으로 그려진다", async ({
  page,
}) => {
  await page.goto("/");

  await pasteImage(page, fixture("wire-only.png"));

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 30000 });
});

test("클립보드에 이미지가 아닌 데이터가 있으면 오류 메시지가 뜨고 PDF 업로드 폼은 그대로 사용할 수 있다", async ({
  page,
}) => {
  await page.goto("/");

  await pasteText(page, "hello");

  await expect(page.getByText("클립보드에 이미지가 없습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF에서 회로 자동 Draw" })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toBeEnabled();
});

test("회로로 보이는 요소를 전혀 찾지 못하면 오류 메시지가 뜬다", async ({ page }) => {
  await page.goto("/");

  await pasteImage(page, fixture("text-only.png"));

  await expect(page.getByText(/회로로 보이는 요소를 찾지 못했습니다/)).toBeVisible({
    timeout: 30000,
  });
});
