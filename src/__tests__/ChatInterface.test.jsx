import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, afterEach } from 'vitest';

import ChatInput from '../components/Chat/ChatInput.jsx';
import ChatArea from '../components/Chat/ChatArea.jsx';

afterEach(() => {
  vi.clearAllMocks();
});

describe('Chat interface', () => {
  test('sends messages with button', async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatInput message="Hello" setMessage={() => {}} sendMessage={sendMessage} />
    );
    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(sendMessage).toHaveBeenCalled();
  });

  test('renders chat messages', () => {
    const messages = [
      {
        _id: '1',
        sender: { _id: 'u1', displayName: 'Alice', avatarUrl: null },
        content: 'Hi',
        createdAt: Date.now(),
      },
      {
        _id: '2',
        sender: { _id: 'u2', displayName: 'Bob', avatarUrl: null },
        content: 'Hey',
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

    expect(screen.getByText('Hi')).toBeInTheDocument();
    expect(screen.getByText('Hey')).toBeInTheDocument();
  });
});
