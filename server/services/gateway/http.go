package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	authpb "github.com/BrandonCasa/rebound-chat/services/common/genproto/auth"
	"google.golang.org/grpc"
)

// httpServer exposes a minimal HTTP API that forwards requests to other
// services using gRPC. Only the `/users/verify` endpoint is implemented.
// Additional routes can be added following the same pattern.
type httpServer struct {
	addr       string
	authClient authpb.AuthServiceClient
}

func NewHTTPServer(addr string, conn *grpc.ClientConn) *httpServer {
	return &httpServer{
		addr:       addr,
		authClient: authpb.NewAuthServiceClient(conn),
	}
}

func (s *httpServer) Run() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/users/verify", s.handleVerify)

	srv := &http.Server{
		Addr:    s.addr,
		Handler: mux,
	}

	log.Printf("HTTP server running on %s", s.addr)
	return srv.ListenAndServe()
}

func (s *httpServer) handleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	token := extractToken(r.Header.Get("Authorization"))
	if token == "" {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte("missing token"))
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	resp, err := s.authClient.VerifyToken(ctx, &authpb.VerifyTokenInbound{Token: token})
	if err != nil || !resp.Valid {
		w.WriteHeader(http.StatusUnauthorized)
		if err != nil {
			w.Write([]byte(err.Error()))
		} else {
			w.Write([]byte(resp.Status))
		}
		return
	}

	payload := map[string]any{
		"user":   resp.User,
		"status": resp.Status,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(payload)
}

// extractToken strips the bearer prefix from an Authorization header value.
func extractToken(h string) string {
	parts := strings.SplitN(h, " ", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return h
}
