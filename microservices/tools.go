package tools

import (
	// protoc code generators
	_ "github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway" // v2.x
	_ "google.golang.org/grpc/cmd/protoc-gen-go-grpc"                     // v1.x
	_ "google.golang.org/protobuf/cmd/protoc-gen-go"                      // v1.x
)
