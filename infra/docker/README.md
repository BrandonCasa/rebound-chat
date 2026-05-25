# Rebound Container Builds

These image definitions are scaffolding for the AWS migration. They are not wired into the existing EC2/PM2/Nginx deployment.

Local build commands:

```sh
docker build -f infra/docker/api.Dockerfile -t rebound-api:local .
docker build -f infra/docker/worker.Dockerfile -t rebound-worker:local .
docker build -f infra/docker/realtime.Dockerfile -t rebound-realtime:local .
docker build -f infra/docker/livekit.Dockerfile -t rebound-livekit:local .
docker build -f infra/docker/web-build.Dockerfile -t rebound-web-build:local .
```

The Node images use Node 22 and pnpm through Corepack. Runtime role selection is controlled by `SERVER_ROLE`.
