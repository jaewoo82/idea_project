import { expect, test } from "@playwright/test";

test("회로 시뮬레이터 페이지에 CircuitJS1이 로드되고 기본 회로가 동작한다", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "회로 시뮬레이터" })
  ).toBeVisible();

  const iframe = page.locator("iframe");
  await expect(iframe).toHaveAttribute(
    "src",
    "https://www.falstad.com/circuit/circuitjs.html"
  );

  const circuit = page.frameLocator("iframe");
  await expect(circuit.getByText("File")).toBeVisible({ timeout: 15000 });
  await expect(circuit.getByText("RUN / Stop")).toBeVisible();

  await circuit.getByText("File").click();
  await expect(circuit.getByText("Export As Text...")).toBeVisible();
});
