PROTO_DIR=proto

all: proto

proto:
	protoc -I $(PROTO_DIR) --go_out=$(PROTO_DIR) --go_opt=paths=source_relative \
		--go-grpc_out=$(PROTO_DIR) --go-grpc_opt=paths=source_relative \
		$(PROTO_DIR)/user/user.proto $(PROTO_DIR)/chat/chat.proto

clean:
	rm -f $(PROTO_DIR)/user/*.pb.go $(PROTO_DIR)/chat/*.pb.go
