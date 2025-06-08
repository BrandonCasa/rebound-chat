package main

func main() {
	grpcServer := NewgRPCServer(":9000")
	grpcServer.Run()

}
