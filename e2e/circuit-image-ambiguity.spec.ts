import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import LZString from "lz-string";

const fixture = (name: string) => path.join(process.cwd(), "e2e", "fixtures", name);

async function pasteAmbiguousFixture(page: import("@playwright/test").Page) {
  await page.goto("/");

  const base64 = readFileSync(fixture("mixed-confident-and-ambiguous.png")).toString("base64");
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

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toBeVisible({
    timeout: 15000,
  });
}

test("클립보드 이미지에서 확신이 낮은 소자가 있으면 팝업이 뜨고, 후보를 고르면 그 지점이 회로에 반영된다", async ({
  page,
}) => {
  await pasteAmbiguousFixture(page);

  const iframe = page.locator("iframe");
  await expect(iframe).not.toHaveAttribute("src", /\?ctz=/);

  await page.getByRole("button", { name: "저항" }).click();

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });

  // 확신 있게 인식된 배선도 애매함 해결과 무관하게 최종 회로에 함께 반영돼야 한다.
  const src = await iframe.getAttribute("src");
  const ctz = new URL(src!, "http://localhost").searchParams.get("ctz");
  const dslText = LZString.decompressFromEncodedURIComponent(ctz!);
  expect(dslText).toContain("w ");
});

test("클립보드 이미지에서 '그 외(직접 입력)'로 입력한 값이 최종 회로에 반영된다", async ({
  page,
}) => {
  await pasteAmbiguousFixture(page);

  await page.getByRole("button", { name: "그 외 (직접 입력)" }).click();
  await page.getByPlaceholder("이 소자가 실제로 무엇인지 입력하세요").fill("가변저항 500옴");
  await page.getByRole("button", { name: "확인" }).click();

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});

test("클립보드 이미지에서 '모르겠음'으로 남기면 placeholder로 표시되고 시뮬레이션을 방해하지 않는다", async ({
  page,
}) => {
  await pasteAmbiguousFixture(page);

  await page.getByRole("button", { name: "모르겠음" }).click();

  await expect(page.getByRole("heading", { name: /애매한 소자 확인/ })).toHaveCount(0);
  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });
});
