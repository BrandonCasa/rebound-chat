package main

import (
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"log"
)

// entry point starts both the gRPC and HTTP servers. The gRPC server exposes
// the GatewayService for internal communication while the HTTP server serves
// external API requests.
func main() {
	authAddr := ":9001"

	conn, err := grpc.Dial(authAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("failed to connect to auth service: %v", err)
	}
	defer conn.Close()

	grpcServer := NewgRPCServer(":9000", authAddr)
	go func() {
		if err := grpcServer.Run(); err != nil {
			log.Fatal(err)
		}
	}()

	httpServer := NewHTTPServer(":8080", conn)
	if err := httpServer.Run(); err != nil {
		log.Fatal(err)
	}
}
