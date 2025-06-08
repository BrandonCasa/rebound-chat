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

// UserStore provides simple in-memory storage for users.
type UserStore struct {
	mu    sync.RWMutex
	users map[string]*User
}

// NewUserStore returns an in-memory user store.
func NewUserStore() *UserStore {
	return &UserStore{users: make(map[string]*User)}
}

func (s *UserStore) Add(u *User) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.users[u.ID] = u
}

func (s *UserStore) Get(id string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[id]
	return u, ok
}

func (s *UserStore) FindByEmail(email string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.Email == email {
			return u, true
		}
	}
	return nil, false
}

func (s *UserStore) FindByToken(token string) (*User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.Token == token {
			return u, true
		}
	}
	return nil, false
}
