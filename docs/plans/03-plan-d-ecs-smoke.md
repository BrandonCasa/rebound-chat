# Plan D Runbook: First Real Image Push + ECS Smoke

This is the tactical runbook for PR D in `docs/plans/02-master-plan.md`.

## Objective

Run real `api` and `worker` containers in the dev ECS cluster in `us-east-2`.

## Required Config Names

Plan D tasks must reference these values by name:

- Parameters:
  - `/rebound/dev/database/url`
  - `/rebound/dev/storage/media-bucket`
  - `/rebound/dev/storage/live-bucket`
  - `/rebound/dev/livekit/url`
  - `/rebound/dev/livekit/api-key`
  - `/rebound/dev/livekit/api-secret`
  - `/rebound/dev/livekit/webhook-secret`
- Outputs:
  - `ApiRepositoryUri`
  - `WorkerRepositoryUri`
  - `HttpApiUrl`
  - `GitHubActionsRoleArn`

These names should be created automatically by CDK for `dev` and mirrored under `/rebound/prod/...` for `prod`.

## CDK Controls

The CDK keeps dev services idle and CodeBuild dry-run safe by default. Plan D uses explicit context flags so the switch to real image push and running tasks is visible in each deploy command.

- `--context codeBuildDryRun=false` sets CodeBuild `DRY_RUN=false` so image builds push to ECR.
- `--context imageTags.api=<tag>` makes the API task definition use `rebound-dev-api:<tag>`.
- `--context imageTags.worker=<tag>` makes the worker task definition use `rebound-dev-worker:<tag>`.
- `--context serviceDesiredCounts.api=1` starts one API task.
- `--context serviceDesiredCounts.worker=1` starts one worker task.
- `--context runtimeSmokeMode=true` injects the dev-only `REBOUND_ECS_SMOKE_MODE=1` runtime guard into API and worker tasks. This is now an optional compatibility guard for health-only smoke checks and is rejected outside `APP_ENV=dev`.

Keep `realtime` and `livekit` at `0` until their own smoke gates are ready.

## Deployment Sequence

1. Rehydrate or update the dev CDK stacks with real image push enabled:

   ```powershell
   pnpm --filter rebound-cdk exec cdk deploy --all --require-approval never --context appEnv=dev --context codeBuildDryRun=false
   ```

2. Build and push API and worker images to ECR. Resolve repository URIs from the named outputs instead of manually managed literals. Use one immutable tag for both services so the ECS task definitions point at a matching source snapshot.

   ```powershell
   $tag = "<unique-tag>"
   $account = "722347332210"
   $region = "us-east-2"
   $registry = "$account.dkr.ecr.$region.amazonaws.com"

   aws ecr get-login-password --region $region | docker login --username AWS --password-stdin $registry
   docker build -f infra/docker/api.Dockerfile -t "$registry/rebound-dev-api:$tag" .
   docker build -f infra/docker/worker.Dockerfile -t "$registry/rebound-dev-worker:$tag" .
   docker push "$registry/rebound-dev-api:$tag"
   docker push "$registry/rebound-dev-worker:$tag"
   ```

3. Redeploy CDK with the image tags and desired counts:

   ```powershell
   pnpm --filter rebound-cdk exec cdk deploy Rebound-dev-Compute --require-approval never --context appEnv=dev --context imageTags.api=$tag --context imageTags.worker=$tag --context serviceDesiredCounts.api=1 --context serviceDesiredCounts.worker=1 --context runtimeSmokeMode=true
   ```

4. Smoke ECS:

   ```powershell
   aws ecs describe-services --region us-east-2 --cluster <cluster-name> --services <api-service-name> <worker-service-name>
   aws logs tail /aws/ecs/<api-log-group> --region us-east-2 --since 30m
   aws logs tail /aws/ecs/<worker-log-group> --region us-east-2 --since 30m
   aws ssm get-parameters-by-path --region us-east-2 --path /rebound/dev/ --recursive
   ```

## Current Risk

The repo startup coupling gate is now cleared: `SERVER_ROLE=api|worker` can start in dev cutover mode without initializing MongoDB/Mongoose, `/healthz` reports Aurora + S3 as the required dependencies for those roles, and Mongo-only product routes fail with controlled dependency errors instead of crashing the process.

`runtimeSmokeMode=true` can still be used for narrow health-only smoke runs, but it is no longer required for API/worker startup in dev. The remaining Plan D promotion work is the actual ECS desired-count deploy and runtime verification in `us-east-2`.

## Execution Record

May 13, 2026:

- Recreated `Rebound-dev-Pipeline` in `us-east-2`.
- Verified `rebound-dev-api`, `rebound-dev-worker`, `rebound-dev-frontend`, and `rebound-dev-livekit` CodeBuild projects have `DRY_RUN=false`.
- Built and pushed API image `722347332210.dkr.ecr.us-east-2.amazonaws.com/rebound-dev-api:plan-d-bd49300ddfe1-20260513-003749`.
- Built and pushed worker image `722347332210.dkr.ecr.us-east-2.amazonaws.com/rebound-dev-worker:plan-d-bd49300ddfe1-20260513-003749`.
- API digest: `sha256:458ca0d7c7e46eb9eb1fc754ff212a4d87e479445a080a13b6df523ddd6fd512`.
- Worker digest: `sha256:aae0cd5cb5794b7ffafb1f9da2141c5ab43c390a3f46c483cd8f0da0770b2d56`.
- Redeployed `Rebound-dev-Compute` so API and worker task definitions reference those image tags.
- Verified API and worker ECS services are active with desired/running/pending counts at `0/0/0`.

Build issue found and fixed:

- Server Dockerfiles did not copy `server/pnpm-workspace.yaml`, so frozen pnpm installs could not match lockfile overrides.
- Node Dockerfiles and Node-based CodeBuild buildspecs now pin pnpm `10.32.1` through Corepack for repeatable local and CodeBuild installs.

Repository update, May 13, 2026:

- Added a dev-only `runtimeSmokeMode` CDK context flag that sets `REBOUND_ECS_SMOKE_MODE=1` on API and worker task definitions only.
- Added server startup handling so API smoke mode serves `/healthz` without MongoDB and worker smoke mode stays alive without starting MongoDB or live cleanup.
- Added local tests covering the smoke-mode runtime guard and CDK task-definition wiring.

Repository update, May 15, 2026:

- Removed the default MongoDB/Mongoose startup requirement for `SERVER_ROLE=api|worker` in dev cutover mode.
- Kept live/session persistence on the stream-session repository boundary so API and worker paths can use Prisma/Aurora-backed storage when `DATABASE_URL` is present.
- Added dependency-aware `/healthz` behavior for API/worker dev cutover mode: Aurora + S3 required, Mongo not required.
- Added controlled `503 mongo_dependency_unavailable` responses for Mongo-backed `/api` routes when Mongo is intentionally not bootstrapped.
- Verified locally with `pnpm --prefix server test`.

Repository update, May 13, 2026:

- Smoke Test was done successfully for `rebound-dev-api` and `rebound-dev-worker`. `rebound-dev-api` logged nothing, and was running. `rebound-dev-worker` logged:

```powershell
{"status":"ok","service":"worker"}
```
