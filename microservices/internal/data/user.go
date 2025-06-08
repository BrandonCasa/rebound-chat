package data

import "sync"

// User represents a simple user record.
type User struct {
	ID          string
	Username    string
	Email       string
	DisplayName string
	Bio         string
	Password    string
	Token       string
}

// UserStore defines basic operations for user storage.
type UserStore interface {
	Add(u *User)
	Get(id string) (*User, bool)
	FindByEmail(email string) (*User, bool)
	FindByToken(token string) (*User, bool)
}

// InMemoryUserStore provides simple in-memory storage for users.
type InMemoryUserStore struct {
	mu    sync.RWMutex
	users map[string]*User
}

// NewUserStore returns an in-memory user store.
func NewUserStore() *InMemoryUserStore {
	return &InMemoryUserStore{users: make(map[string]*User)}
}

func (s *InMemoryUserStore) Add(u *User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[u.ID] = u
}

func (s *InMemoryUserStore) Get(id string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	return u, ok
}

func (s *InMemoryUserStore) FindByEmail(email string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.Email == email {
			return u, true
		}
	}
	return nil, false
}

func (s *InMemoryUserStore) FindByToken(token string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.Token == token {
			return u, true
		}
	}
	return nil, false
}
