import { Injectable } from '@nestjs/common';

import { User } from './user.model';

type UserRecord = User & { email?: string };

@Injectable()
export class UsersService {
  // Temporary in-memory store to unblock GraphQL schema consumers until Prisma is wired up.
  private readonly users: UserRecord[] = [
    {
      id: '1',
      username: 'reboundbot',
      displayName: 'Rebound Bot',
      avatarUrl: undefined,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      email: 'bot@example.com'
    }
  ];

  findByUsername(username: string): User | null {
    const normalized = username.trim().toLowerCase();
    const match = this.users.find((user) => user.username === normalized);

    return match ?? null;
  }
}
