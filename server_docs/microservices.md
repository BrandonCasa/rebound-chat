# Microservice Backend

The Go implementation is split into small gRPC services with an HTTP gateway. Clients send normal REST requests to the gateway which forwards them to the appropriate service using gRPC. Responses from the services are then returned to the client.

For example, a POST to `/users/verify` is received by the gateway, translated into a `Verify` gRPC call to the user service and the result is sent back as the HTTP response.
