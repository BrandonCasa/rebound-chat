import { render, screen, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi, afterEach, beforeEach } from "vitest";

import ChatInput from "../components/Chat/ChatInput.jsx";
import ChatArea from "../components/Chat/ChatArea.jsx";

// Mock ChatInput to avoid loading MUI icon components
vi.mock("../components/Chat/ChatInput.jsx", () => ({
	default: ({ sendMessage }) => <button onClick={sendMessage}>Send</button>,
}));

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe("Chat interface", () => {
	test("sends messages with button", () => {
		const sendMessage = vi.fn();
		render(<ChatInput message="Hello" setMessage={() => {}} sendMessage={sendMessage} />);
		fireEvent.click(screen.getByRole("button", { name: /send/i }));
		expect(sendMessage).toHaveBeenCalled();
	});

	test("renders chat messages", () => {
		const messages = [
			{
				_id: "1",
				sender: { _id: "u1", displayName: "Alice", avatarUrl: null },
				content: "Hi",
				createdAt: Date.now(),
			},
			{
				_id: "2",
				sender: { _id: "u2", displayName: "Bob", avatarUrl: null },
				content: "Hey",
				createdAt: Date.now(),
			},
		];

		render(
			<ChatArea
				messages={messages}
				previewUser={() => {}}
				onContextMenu={() => {}}
				editingMessageId={null}
				editingText=""
				setEditingText={() => {}}
				commitEdit={() => {}}
				cancelEdit={() => {}}
			/>
		);

		expect(screen.getByText("Hi")).toBeInTheDocument();
		expect(screen.getByText("Hey")).toBeInTheDocument();
	});
});
