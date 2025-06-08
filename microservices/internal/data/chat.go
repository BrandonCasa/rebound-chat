package data

import "sync"

// Message represents a chat message.
type Message struct {
	ID      string
	RoomID  string
	UserID  string
	Content string
}

// MessageStore provides in-memory message storage.
type MessageStore struct {
	mu       sync.RWMutex
	messages map[string][]*Message // room_id -> messages
}

func NewMessageStore() *MessageStore {
	return &MessageStore{messages: make(map[string][]*Message)}
}

func (s *MessageStore) Add(m *Message) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages[m.RoomID] = append(s.messages[m.RoomID], m)
}

func (s *MessageStore) List(roomID string) []*Message {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]*Message(nil), s.messages[roomID]...)
}
