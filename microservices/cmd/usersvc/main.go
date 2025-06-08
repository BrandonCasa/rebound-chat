package main

import (
	"context"
	"log"
	"net"

	"github.com/google/uuid"
	"google.golang.org/grpc"

	"rebound-chat/microservices/internal/data"
	userpb "rebound-chat/microservices/proto/user"
)

type userServer struct {
	userpb.UnimplementedUserServiceServer
	store *data.UserStore
}

type UserStore = data.userStore

func (s *userServer) Register(ctx context.Context, req *userpb.RegisterRequest) (*userpb.AuthResponse, error) {
	id := uuid.NewString()
	s.store.Add(&data.User{
		ID:          id,
		Username:    req.Username,
		Email:       req.Email,
		DisplayName: req.DisplayName,
		Bio:         req.Bio,
		Password:    req.Password,
	})
	// token generation skipped for brevity
	return &userpb.AuthResponse{UserId: id, Token: "token-placeholder"}, nil
}

func (s *userServer) Login(ctx context.Context, req *userpb.LoginRequest) (*userpb.AuthResponse, error) {
	if u, ok := s.store.FindByEmail(req.Email); ok && u.Password == req.Password {
		return &userpb.AuthResponse{UserId: u.ID, Token: "token-placeholder"}, nil
	}
	return nil, grpc.Errorf(grpc.Code(grpc.Unauthenticated), "invalid credentials")
}

func (s *userServer) GetProfile(ctx context.Context, req *userpb.ProfileRequest) (*userpb.ProfileResponse, error) {
	if u, ok := s.store.Get(req.Id); ok {
		return &userpb.ProfileResponse{
			UserId:      u.ID,
			Username:    u.Username,
			DisplayName: u.DisplayName,
			Bio:         u.Bio,
		}, nil
	}
	return nil, grpc.Errorf(grpc.Code(grpc.NotFound), "user not found")
}

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	s := grpc.NewServer()
	store := data.NewUserStore()
	userpb.RegisterUserServiceServer(s, &userServer{store: store})
	log.Println("user service listening on :50051")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
