package main

import (
	"log"
	"net"

	gatewaypb "github.com/BrandonCasa/rebound-chat/services/common/genproto/gateway"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	srv "github.com/BrandonCasa/rebound-chat/services/gateway/service"
)

type gRPCServer struct {
	addr     string
	authAddr string
}

func NewgRPCServer(addr, authAddr string) *gRPCServer {
	return &gRPCServer{
		addr:     addr,
		authAddr: authAddr,
	}
}

func (s *gRPCServer) Run() error {
	lis, err := net.Listen("tcp", s.addr)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	conn, err := grpc.Dial(s.authAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return err
	}
	defer conn.Close()

	grpcServer := grpc.NewServer()
	gatewaypb.RegisterGatewayServiceServer(grpcServer, srv.NewGatewayService(conn))

	log.Printf("gRPC server is running on %s", s.addr)

	return grpcServer.Serve(lis)
}
