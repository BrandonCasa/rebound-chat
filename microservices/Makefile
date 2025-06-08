PROTO_DIR=proto

all: proto

proto:
	protoc -I $(PROTO_DIR) \
	-I $(shell go env GOPATH)/pkg/mod/github.com/grpc-ecosystem/grpc-gateway@v2.16.0 \
	-I $(shell go env GOPATH)/pkg/mod \
	--go_out=$(PROTO_DIR) --go_opt=paths=source_relative \
	--go-grpc_out=$(PROTO_DIR) --go-grpc_opt=paths=source_relative \
	--grpc-gateway_out=$(PROTO_DIR) --grpc-gateway_opt=paths=source_relative \
	$(PROTO_DIR)/user/user.proto $(PROTO_DIR)/chat/chat.proto

clean:
	rm -f $(PROTO_DIR)/user/*.pb.go $(PROTO_DIR)/user/*.gw.go \
	$(PROTO_DIR)/chat/*.pb.go $(PROTO_DIR)/chat/*.gw.go
