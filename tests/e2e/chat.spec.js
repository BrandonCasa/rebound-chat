import { expect, test } from "@playwright/test";

test.describe("chat route", () => {
	test("renders the chat shell with stable automation hooks", async ({ page }) => {
		await page.goto("/chat");

		await expect(page.getByTestId("chat-page")).toBeVisible();
		await expect(page.getByTestId("chat-shell")).toBeVisible();
		await expect(page.getByTestId("chat-room-menu-button")).toBeVisible();
		await expect(page.getByTestId("chat-user-list-button")).toBeVisible();
		await expect(page.getByTestId("chat-message-scroll-container")).toBeVisible();
		await expect(page.getByTestId("chat-composer")).toBeVisible();
		await expect(page.getByTestId("chat-message-input")).toBeVisible();
		await expect(page.getByTestId("chat-send-button")).toBeDisabled();
	});
});
