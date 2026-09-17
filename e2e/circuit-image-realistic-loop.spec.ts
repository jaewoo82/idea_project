import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import LZString from "lz-string";

const fixture = (name: string) => path.join(process.cwd(), "e2e", "fixtures", name);

test("배선이 부품 기호에 맞닿은 현실적인 회로 캡쳐를 붙여넣으면 배선이 실제로 인식된다", async ({
  page,
}) => {
  await page.goto("/");

  const base64 = readFileSync(fixture("realistic-battery-resistor-loop.png")).toString("base64");
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

  // 배선끼리, 그리고 배선과 부품 기호(저항 지그재그, 배터리)가 서로 맞닿아
  // 있는 실사 수준 회로라, 부품/라벨 잔여물이 애매함 팝업으로 여러 번 뜬다.
  // 정확한 횟수에 의존하지 않고, 팝업이 남아있는 동안 "모르겠음"으로 넘긴다.
  const heading = page.getByRole("heading", { name: /애매한 소자 확인/ });
  await expect(heading).toBeVisible({ timeout: 15000 });
  for (let i = 0; i < 20 && (await heading.count()) > 0; i++) {
    await page.getByRole("button", { name: "모르겠음" }).click();
  }
  await expect(heading).toHaveCount(0);

  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute("src", /\?ctz=.+/, { timeout: 15000 });

  const src = await iframe.getAttribute("src");
  const ctz = new URL(src!, "http://localhost").searchParams.get("ctz");
  const dslText = LZString.decompressFromEncodedURIComponent(ctz!);
  const wireLines = dslText!.split("\n").filter((line) => line.startsWith("w "));
  // 최소한 배선(연결선)은 생성돼야 한다는 것이 이 회귀 테스트의 핵심 기준이다.
  expect(wireLines.length).toBeGreaterThanOrEqual(3);
});
