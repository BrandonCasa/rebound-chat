package main

import (
	"context"
	"log"
	"net/http"
	"os"

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

	userAddr := os.Getenv("USERSVC_ADDR")
	if userAddr == "" {
		userAddr = "localhost:50051"
	}
	chatAddr := os.Getenv("CHATSVC_ADDR")
	if chatAddr == "" {
		chatAddr = "localhost:50052"
	}

	if err := userpb.RegisterUserServiceHandlerFromEndpoint(ctx, mux, userAddr, opts); err != nil {
		log.Fatalf("failed to register user service: %v", err)
	}
	if err := chatpb.RegisterChatServiceHandlerFromEndpoint(ctx, mux, chatAddr, opts); err != nil {
		log.Fatalf("failed to register chat service: %v", err)
	}

	port := os.Getenv("GATEWAY_PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("gateway listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
