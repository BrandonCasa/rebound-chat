package main

import (
	"context"
	"log"
	"net"
	"os"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"rebound-chat/microservices/internal/data"
	userpb "rebound-chat/microservices/proto/user"
)

type userServer struct {
	userpb.UnimplementedUserServiceServer
	store data.UserStore
}

type UserStore = data.UserStore

func (s *userServer) Register(ctx context.Context, req *userpb.RegisterRequest) (*userpb.AuthResponse, error) {
	id := uuid.NewString()
	token := uuid.NewString()
	s.store.Add(&data.User{
		ID:          id,
		Username:    req.Username,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		Bio:         req.Bio,
		Password:    req.Password,
		Token:       token,
	})
	return &userpb.AuthResponse{UserId: id, Token: token}, nil
}

func (s *userServer) Login(ctx context.Context, req *userpb.LoginRequest) (*userpb.AuthResponse, error) {
	if u, ok := s.store.FindByEmail(req.Email); ok && u.Password == req.Password {
		u.Token = uuid.NewString()
		return &userpb.AuthResponse{UserId: u.ID, Token: u.Token}, nil
	}
	return nil, status.Errorf(codes.Unauthenticated, "invalid credentials")
}

func (s *userServer) GetProfile(ctx context.Context, req *userpb.ProfileRequest) (*userpb.ProfileResponse, error) {
	if u, ok := s.store.Get(req.Id); ok {
		if req.Token != "" && u.Token != req.Token {
			return nil, status.Errorf(codes.PermissionDenied, "invalid token")
		}
		return &userpb.ProfileResponse{
			UserId:      u.ID,
			Username:    u.Username,
			DisplayName: u.DisplayName,
			Bio:         u.Bio,
		}, nil
	}
	return nil, status.Errorf(codes.NotFound, "user not found")
}

func (s *userServer) Verify(ctx context.Context, req *userpb.VerifyRequest) (*userpb.VerifyResponse, error) {
	if u, ok := s.store.FindByToken(req.Token); ok {
		return &userpb.VerifyResponse{UserId: u.ID, Valid: true}, nil
	}
	return &userpb.VerifyResponse{Valid: false}, nil
}

func main() {
	port := os.Getenv("USERSVC_PORT")
	if port == "" {
		port = "50051"
	}
	lis, err := net.Listen("tcp", ":"+port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	s := grpc.NewServer()
	var store data.UserStore
	dsn := os.Getenv("POSTGRES_DSN")
	if dsn != "" {
		pgStore, err := data.NewPostgresUserStore(dsn)
		if err != nil {
			log.Fatalf("failed to connect postgres: %v", err)
		}
		store = pgStore
		defer pgStore.Close()
	} else {
		store = data.NewUserStore()
	}
	userpb.RegisterUserServiceServer(s, &userServer{store: store})
	log.Printf("user service listening on :%s", port)
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
