#!/bin/sh
# Simple script to start all Go microservices

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

# start services in background

go run ./microservices/cmd/usersvc &
USERSVC_PID=$!

go run ./microservices/cmd/chatsvc &
CHATSVC_PID=$!

go run ./microservices/cmd/gateway &
GATEWAY_PID=$!

trap 'echo "Stopping services..."; kill $USERSVC_PID $CHATSVC_PID $GATEWAY_PID' INT TERM

wait
