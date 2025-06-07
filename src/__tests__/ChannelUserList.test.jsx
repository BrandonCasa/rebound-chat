import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, test, expect, vi, afterEach } from 'vitest';

import authReducer from '../slices/authSlice';
import ChannelList from '../components/Chat/ChannelList.jsx';
import UserList from '../components/Chat/UserList.jsx';

afterEach(() => {
  vi.clearAllMocks();
});

function renderWithStore(ui, store) {
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('Channel and user lists', () => {
  test('renders channel names and dispatches on select', () => {
    const store = configureStore({ reducer: { auth: authReducer } });
    store.dispatch = vi.fn();
    const channels = { ch1: { name: 'General' }, ch2: { name: 'Random' } };
    const setMessages = vi.fn();

    renderWithStore(
      <ChannelList channels={channels} setMessages={setMessages} />, 
      store
    );

    expect(screen.getByText('General')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Random'));
    expect(store.dispatch).toHaveBeenCalled();
  });

  test('renders user display names', () => {
    const users = [
      { id: 1, displayName: 'Alice' },
      { id: 2, displayName: 'Bob' },
    ];
    render(<UserList users={users} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
