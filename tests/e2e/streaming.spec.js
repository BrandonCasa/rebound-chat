import { expect, test } from "./fixtures.js";

test.describe("streaming routes", () => {
	test("available streams route exposes stable unauthenticated state", async ({ page }) => {
		await page.goto("/live");

		await expect(page.getByTestId("available-streams-login-required")).toBeVisible();
		await expect(page.getByText("Log in to view live streams.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
	});

	test("live share route exposes stable unauthenticated state", async ({ page }) => {
		await page.goto("/live/share/playwright-token");

		await expect(page.getByTestId("live-share-page")).toBeVisible();
		await expect(page.getByTestId("live-share-login-required")).toBeVisible();
		await expect(page.getByText("Log in to view this live stream.")).toBeVisible();
		await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
	});

	test("desktop broadcast route exposes the browser compatibility guard", async ({ page }) => {
		await page.goto("/live/broadcast");

		await expect(page.getByTestId("desktop-live-electron-required")).toBeVisible();
		await expect(page.getByText("Desktop streaming is only available in the Electron app.")).toBeVisible();
	});
});
