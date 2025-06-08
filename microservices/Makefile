# Makefile for protobuf + gRPC + grpc-gateway codegen

PROTO_DIR := proto

# ─── Plugin versions ────────────────────────────────────────────────────────────
# adjust these if you bump tools in tools.go / go.mod
PROTOC_GEN_GO_VER      := v1.36.5
PROTOC_GEN_GO_GRPC_VER := v1.5.1
GRPC_GATEWAY_VER       := v2.26.3

.PHONY: proto-plugins all proto clean

# ─── Install protoc plugins into $(go env GOPATH)/bin ───────────────────────────
proto-plugins:
	@echo "Installing protoc plugins..."
	go install google.golang.org/protobuf/cmd/protoc-gen-go@$(PROTOC_GEN_GO_VER)
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@$(PROTOC_GEN_GO_GRPC_VER)
	go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@$(GRPC_GATEWAY_VER)

# ─── Default: generate Go from your .proto files ────────────────────────────────
all: proto

proto:
	@echo "Generating Go code from .proto files..."
	protoc -I $(PROTO_DIR) \
		-I $(shell go env GOPATH)/pkg/mod/github.com/grpc-ecosystem/grpc-gateway/v2@$(GRPC_GATEWAY_VER) \
		-I $(shell go env GOPATH)/pkg/mod \
		--go_out=$(PROTO_DIR)            --go_opt=paths=source_relative \
		--go-grpc_out=$(PROTO_DIR)       --go-grpc_opt=paths=source_relative \
		--grpc-gateway_out=$(PROTO_DIR)  --grpc-gateway_opt=paths=source_relative \
		$(PROTO_DIR)/user/user.proto \
		$(PROTO_DIR)/chat/chat.proto

# ─── Remove all generated files ─────────────────────────────────────────────────
clean:
	@echo "Cleaning up generated files..."
	rm -f $(PROTO_DIR)/user/*.pb.go  $(PROTO_DIR)/user/*.gw.go  \
	      $(PROTO_DIR)/chat/*.pb.go  $(PROTO_DIR)/chat/*.gw.go
