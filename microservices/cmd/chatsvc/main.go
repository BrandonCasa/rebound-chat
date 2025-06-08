package main

import (
	"context"
	"log"
	"net"

	"github.com/google/uuid"
	"google.golang.org/grpc"

	"rebound-chat/microservices/internal/data"
	chatpb "rebound-chat/microservices/proto/chat"
)

type chatServer struct {
	chatpb.UnimplementedChatServiceServer
	store *data.MessageStore
}

type MessageStore = data.MessageStore

func (s *chatServer) SendMessage(ctx context.Context, req *chatpb.MessageRequest) (*chatpb.MessageResponse, error) {
	id := uuid.NewString()
	s.store.Add(&data.Message{
		ID:      id,
		RoomID:  req.RoomId,
		UserID:  req.UserId,
		Content: req.Content,
	})
	return &chatpb.MessageResponse{MessageId: id}, nil
}

func (s *chatServer) ListMessages(ctx context.Context, req *chatpb.ListRequest) (*chatpb.MessageListResponse, error) {
	msgs := s.store.List(req.RoomId)
	resp := &chatpb.MessageListResponse{}
	for _, m := range msgs {
		resp.Messages = append(resp.Messages, &chatpb.MessageItem{
			MessageId: m.ID,
			UserId:    m.UserID,
			Content:   m.Content,
		})
	}
	return resp, nil
}

func main() {
	lis, err := net.Listen("tcp", ":50052")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}
	s := grpc.NewServer()
	store := data.NewMessageStore()
	chatpb.RegisterChatServiceServer(s, &chatServer{store: store})
	log.Println("chat service listening on :50052")
	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
