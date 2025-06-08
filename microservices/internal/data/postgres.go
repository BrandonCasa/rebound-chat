package data

import (
	"context"
	"database/sql"
	_ "github.com/jackc/pgx/v5/stdlib"
)

// PostgresUserStore stores users in a PostgreSQL database.
// It expects a table named `users` with columns matching the User fields.
type PostgresUserStore struct {
	db *sql.DB
}

// NewPostgresUserStore creates a new store using the provided DSN.
func NewPostgresUserStore(dsn string) (*PostgresUserStore, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	return &PostgresUserStore{db: db}, nil
}

func (s *PostgresUserStore) Add(u *User) {
	_, _ = s.db.ExecContext(context.Background(),
		`INSERT INTO users (id, username, email, display_name, bio, password, token) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		u.ID, u.Username, u.Email, u.DisplayName, u.Bio, u.Password, u.Token)
}

func (s *PostgresUserStore) Get(id string) (*User, bool) {
	row := s.db.QueryRowContext(context.Background(),
		`SELECT id, username, email, display_name, bio, password, token FROM users WHERE id=$1`, id)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.Bio, &u.Password, &u.Token); err != nil {
		return nil, false
	}
	return &u, true
}

func (s *PostgresUserStore) FindByEmail(email string) (*User, bool) {
	row := s.db.QueryRowContext(context.Background(),
		`SELECT id, username, email, display_name, bio, password, token FROM users WHERE email=$1`, email)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.Bio, &u.Password, &u.Token); err != nil {
		return nil, false
	}
	return &u, true
}

func (s *PostgresUserStore) FindByToken(token string) (*User, bool) {
	row := s.db.QueryRowContext(context.Background(),
		`SELECT id, username, email, display_name, bio, password, token FROM users WHERE token=$1`, token)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.Email, &u.DisplayName, &u.Bio, &u.Password, &u.Token); err != nil {
		return nil, false
	}
	return &u, true
}

func (s *PostgresUserStore) Close() error {
	return s.db.Close()
}
