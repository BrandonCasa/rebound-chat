package main

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"log"
	"net/http"
	"time"
)

type gatewayServer struct {
	addr     string
	services map[string]string // path prefix -> base URL
	client   *http.Client
}

func NewGateway(addr string, services map[string]string) *gatewayServer {
	return &gatewayServer{
		addr:     addr,
		services: services,
		client:   &http.Client{Timeout: 10 * time.Second},
	}
}

func (g *gatewayServer) Run() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/", g.handle)

	srv := &http.Server{Addr: g.addr, Handler: mux}
	log.Printf("Gateway server running on %s", g.addr)
	return srv.ListenAndServe()
}

func (g *gatewayServer) handle(w http.ResponseWriter, r *http.Request) {
	target, ok := g.targetFor(r.URL.Path)
	if !ok {
		http.NotFound(w, r)
		return
	}

	id := generateID()
	r.Header.Set("X-Request-ID", id)

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target+r.URL.Path, r.Body)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Header = r.Header.Clone()

	resp, err := g.client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for k, vv := range resp.Header {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func (g *gatewayServer) targetFor(path string) (string, bool) {
	for prefix, target := range g.services {
		if len(path) >= len(prefix) && path[:len(prefix)] == prefix {
			return target, true
		}
	}
	return "", false
}

func generateID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return ""
	}
	return hex.EncodeToString(b)
}
