import { createHash, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { User } from './user.model';

type UserRecord = User & { email?: string; passwordHash: string };

const hashPassword = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

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
      email: 'bot@example.com',
      passwordHash: hashPassword('reboundbot')
    }
  ];

  private sanitizeUser(user: UserRecord): User {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    void _passwordHash;

    return safeUser;
  }

  findByUsername(username: string): User | null {
    const normalized = username.trim().toLowerCase();
    const match = this.users.find((user) => user.username === normalized);

    return match ? this.sanitizeUser(match) : null;
  }

  findById(id: string): User | null {
    const match = this.users.find((user) => user.id === id);

    return match ? this.sanitizeUser(match) : null;
  }

  validateCredentials(username: string, password: string): User | null {
    const normalized = username.trim().toLowerCase();
    const match = this.users.find((user) => user.username === normalized);

    if (!match) {
      return null;
    }

    const candidateHash = hashPassword(password);
    const storedHash = match.passwordHash;

    const hashedBuffer = Buffer.from(storedHash, 'hex');
    const candidateBuffer = Buffer.from(candidateHash, 'hex');

    if (
      hashedBuffer.length !== candidateBuffer.length ||
      !timingSafeEqual(hashedBuffer, candidateBuffer)
    ) {
      return null;
    }

    return this.sanitizeUser(match);
  }
}
