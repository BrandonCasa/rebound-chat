package service

import (
	"context"
	"encoding/json"
	"strings"

	authpb "github.com/BrandonCasa/rebound-chat/services/common/genproto/auth"
	gwpb "github.com/BrandonCasa/rebound-chat/services/common/genproto/gateway"
	"google.golang.org/grpc"
)

// GatewayService implements the gRPC GatewayServiceServer and exposes helpers to
// talk to downstream services such as the auth service.
type GatewayService struct {
	gwpb.UnimplementedGatewayServiceServer
	authClient authpb.AuthServiceClient
}

// NewGatewayService creates a new GatewayService using the provided gRPC client
// connection to the auth service.
func NewGatewayService(authConn *grpc.ClientConn) *GatewayService {
	return &GatewayService{
		authClient: authpb.NewAuthServiceClient(authConn),
	}
}

// InboundRequest implements the GatewayService gRPC method. Currently only the
// `/users/verify` endpoint is supported which forwards the request to the auth
// service.
func (g *GatewayService) InboundRequest(ctx context.Context, in *gwpb.InboundCall) (*gwpb.OutboundResponse, error) {
	if strings.EqualFold(in.Method, "POST") && in.Path == "/users/verify" {
		token := extractToken(in.Headers["Authorization"])
		if token == "" {
			return &gwpb.OutboundResponse{Status: 401, Body: "missing token"}, nil
		}

		resp, err := g.authClient.VerifyToken(ctx, &authpb.VerifyTokenInbound{Token: token})
		if err != nil {
			return &gwpb.OutboundResponse{Status: 401, Body: err.Error()}, nil
		}

		if !resp.Valid {
			return &gwpb.OutboundResponse{Status: 401, Body: resp.Status}, nil
		}

		data, _ := json.Marshal(map[string]any{
			"user":   resp.User,
			"status": resp.Status,
		})

		return &gwpb.OutboundResponse{
			Status:  200,
			Body:    string(data),
			Headers: map[string]string{"Content-Type": "application/json"},
		}, nil
	}

	return &gwpb.OutboundResponse{Status: 404, Body: "not found"}, nil
}

// extractToken strips the bearer prefix from an Authorization header.
func extractToken(h string) string {
	parts := strings.SplitN(h, " ", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return h
}
