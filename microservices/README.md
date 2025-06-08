# Microservices

This directory contains a prototype Go implementation of the backend using gRPC
microservices. It provides two basic services and a gateway that also offers a
REST interface:

- **User Service** (`cmd/usersvc`) – handles registration, login and profile
  retrieval. Data can be stored in-memory or in PostgreSQL when the
  `POSTGRES_DSN` environment variable is provided.
- **Chat Service** (`cmd/chatsvc`) – stores and lists messages for rooms. When
  `CASSANDRA_HOSTS` and `CASSANDRA_KEYSPACE` are set, messages are persisted in
  Cassandra; otherwise an in-memory store is used.
- **Gateway** (`cmd/gateway`) – exposes the gRPC services over HTTP using
  grpc‑gateway. Clients can call endpoints like `/users/verify` and the gateway
  forwards the request to the appropriate microservice over gRPC.

Protobuf definitions are under `proto/` and can be regenerated with `make proto`.

This is only a minimal skeleton showing how the existing backend could be
structured as gRPC microservices.

## Running the services

Convenience scripts are provided to start all services. On Linux or macOS run:

```bash
./backend.sh
```

On Windows run:

```cmd
backend.bat
```

The scripts launch the user service, chat service and gateway on their default
ports. Override `USERSVC_PORT`, `CHATSVC_PORT` and `GATEWAY_PORT` to change the
listening ports.

### Database configuration

Set `POSTGRES_DSN` to enable PostgreSQL storage for the user service. For the
chat service, provide `CASSANDRA_HOSTS` (comma separated) and
`CASSANDRA_KEYSPACE` to store messages in Cassandra.
