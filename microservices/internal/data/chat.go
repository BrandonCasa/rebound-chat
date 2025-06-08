package data

import "sync"

// Message represents a chat message.
type Message struct {
	ID      string
	RoomID  string
	UserID  string
	Content string
}

// MessageStore defines operations for message storage.
type MessageStore interface {
	Add(m *Message)
	List(roomID string) []*Message
}

// InMemoryMessageStore provides in-memory message storage.
type InMemoryMessageStore struct {
	mu       sync.RWMutex
	messages map[string][]*Message // room_id -> messages
}

func NewMessageStore() *InMemoryMessageStore {
	return &InMemoryMessageStore{messages: make(map[string][]*Message)}
}

func (s *InMemoryMessageStore) Add(m *Message) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages[m.RoomID] = append(s.messages[m.RoomID], m)
}

func (s *InMemoryMessageStore) List(roomID string) []*Message {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]*Message(nil), s.messages[roomID]...)
}
