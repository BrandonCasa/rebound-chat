# Microservices

This directory contains a prototype Go implementation of the backend using gRPC
microservices. It provides two basic services and a gateway:

- **User Service** (`cmd/usersvc`) – handles registration, login and profile
  retrieval. Data is stored in-memory for demonstration purposes.
- **Chat Service** (`cmd/chatsvc`) – stores and lists messages for rooms.
- **Gateway** (`cmd/gateway`) – exposes the gRPC services over HTTP using
  grpc‑gateway.

Protobuf definitions are under `proto/` and can be regenerated with `make proto`.

This is only a minimal skeleton showing how the existing backend could be
structured as gRPC microservices.
