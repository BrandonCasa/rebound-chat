
@echo off

echo Starting user service...

start "usersvc" cmd /c go run ./microservices/cmd/usersvc

echo Starting chat service...

start "chatsvc" cmd /c go run ./microservices/cmd/chatsvc

echo Starting gateway...

start "gateway" cmd /c go run ./microservices/cmd/gateway

echo All services launched. Close windows to stop them.

