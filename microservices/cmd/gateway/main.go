package main

import (
	"context"
	"log"
	"net/http"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"google.golang.org/grpc"

	chatpb "rebound-chat/microservices/proto/chat"
	userpb "rebound-chat/microservices/proto/user"
)

func main() {
	ctx := context.Background()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{grpc.WithInsecure()}

	if err := userpb.RegisterUserServiceHandlerFromEndpoint(ctx, mux, "localhost:50051", opts); err != nil {
		log.Fatalf("failed to register user service: %v", err)
	}
	if err := chatpb.RegisterChatServiceHandlerFromEndpoint(ctx, mux, "localhost:50052", opts); err != nil {
		log.Fatalf("failed to register chat service: %v", err)
	}

	log.Println("gateway listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
