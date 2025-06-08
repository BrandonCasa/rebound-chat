package data

import (
	"github.com/gocql/gocql"
)

// CassandraMessageStore stores messages in a Cassandra cluster.
type CassandraMessageStore struct {
	session *gocql.Session
}

// NewCassandraMessageStore creates a new store using the given hosts and keyspace.
func NewCassandraMessageStore(hosts []string, keyspace string) (*CassandraMessageStore, error) {
	cluster := gocql.NewCluster(hosts...)
	cluster.Keyspace = keyspace
	session, err := cluster.CreateSession()
	if err != nil {
		return nil, err
	}
	return &CassandraMessageStore{session: session}, nil
}

func (s *CassandraMessageStore) Add(m *Message) {
	if err := s.session.Query(`INSERT INTO messages (id, room_id, user_id, content) VALUES (?, ?, ?, ?)`,
		m.ID, m.RoomID, m.UserID, m.Content).Exec(); err != nil {
		// ignore error for brevity
	}
}

func (s *CassandraMessageStore) List(roomID string) []*Message {
	iter := s.session.Query(`SELECT id, room_id, user_id, content FROM messages WHERE room_id = ?`, roomID).Iter()
	var msgs []*Message
	var id, rid, uid, content string
	for iter.Scan(&id, &rid, &uid, &content) {
		msgs = append(msgs, &Message{ID: id, RoomID: rid, UserID: uid, Content: content})
	}
	_ = iter.Close()
	return msgs
}

func (s *CassandraMessageStore) Close() {
	s.session.Close()
}
