import { startServer, stopServer } from './helpers/server.js';
import { io as Client } from 'socket.io-client';
import { expect } from 'chai';

let client;

before(async () => {
  await startServer();
  // client = new Client('http://localhost:6002');
});

after(async () => {
  if (client) client.close();
  await stopServer();
});

describe('Socket.IO events', () => {
  it('authenticates connections with JWT');
  it('lists, creates, joins and leaves rooms');
  it('sends, edits and deletes messages');
  it('notifies watchers on user updates');
});
