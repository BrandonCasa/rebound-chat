package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

func main() {
	http.HandleFunc("/api/users/verify", handleVerify)
	log.Println("Auth service running on :9001")
	log.Fatal(http.ListenAndServe(":9001", nil))
}

func handleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	token := extractToken(r.Header.Get("Authorization"))
	if token != "valid-token" {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}

	resp := map[string]any{
		"user": map[string]any{
			"id":   "123",
			"name": "demo",
		},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func extractToken(h string) string {
	parts := strings.SplitN(h, " ", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return h
}
