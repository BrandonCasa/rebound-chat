import { expect, test } from "./fixtures.js";

test.describe("app smoke", () => {
	test("renders the public landing shell", async ({ page }) => {
		await page.goto("/");

		await expect(page.getByRole("heading", { name: "Rebound" })).toBeVisible();
		await expect(page.getByText("The social hub for gamers and friends.")).toBeVisible();
	});

	test("shows a warning snackbar from the testing page", async ({ page }) => {
		await page.goto("/testing");

		await expect(page.getByRole("heading", { name: "Test Alert" })).toBeVisible();
		await page.getByRole("button", { name: "Alert" }).click();

		await expect(page.getByRole("alert")).toContainText("This is a test snackbar.");
	});
});
