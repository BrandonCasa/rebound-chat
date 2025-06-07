import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, test, expect, vi } from 'vitest';

import authReducer from '../slices/authSlice';
import ProfileCard from '../components/User/ProfileCard.jsx';

vi.mock('../helpers/socket', () => ({
  default: { getSocket: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), connected: false }) }
}));

function renderWithStore(ui, store) {
  return render(<Provider store={store}>{ui}</Provider>);
}

describe('Friend list and profile pages', () => {
  test('displays profile information', () => {
    const store = configureStore({ reducer: { auth: authReducer } });
    const user = {
      id: '1',
      displayName: 'Charlie',
      username: 'char',
      bio: 'Hello there!',
      avatarUrl: null,
      bannerUrl: null,
      friends: [],
    };

    renderWithStore(<ProfileCard user={user} />, store);
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('@char')).toBeInTheDocument();
    expect(screen.getByText('Hello there!')).toBeInTheDocument();
  });
});
