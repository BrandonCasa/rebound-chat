gen:
	@protoc \
		--proto_path=protobuf "protobuf/auth.proto" \
		--go_out=services/common/genproto/auth --go_opt=paths=source_relative \
  	--go-grpc_out=services/common/genproto/auth --go-grpc_opt=paths=source_relative
	
	@protoc \
		--proto_path=protobuf "protobuf/gateway.proto" \
		--go_out=services/common/genproto/gateway --go_opt=paths=source_relative \
  	--go-grpc_out=services/common/genproto/gateway --go-grpc_opt=paths=source_relative