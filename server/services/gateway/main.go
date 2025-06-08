package main

import "log"

func main() {
	services := map[string]string{
		"/api/users/": "http://localhost:9001",
	}
	gw := NewGateway(":8080", services)
	log.Fatal(gw.Run())
}
