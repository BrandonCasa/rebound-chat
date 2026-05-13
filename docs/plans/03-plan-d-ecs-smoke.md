# Plan D Runbook: First Real Image Push + ECS Smoke

This is the tactical runbook for PR D in `docs/plans/02-master-plan.md`.

## Objective

Run real `api` and `worker` containers in the dev ECS cluster in `us-east-2`.

## CDK Controls

The CDK keeps dev services idle and CodeBuild dry-run safe by default. Plan D uses explicit context flags so the switch to real image push and running tasks is visible in each deploy command.

- `--context codeBuildDryRun=false` sets CodeBuild `DRY_RUN=false` so image builds push to ECR.
- `--context imageTags.api=<tag>` makes the API task definition use `rebound-dev-api:<tag>`.
- `--context imageTags.worker=<tag>` makes the worker task definition use `rebound-dev-worker:<tag>`.
- `--context serviceDesiredCounts.api=1` starts one API task.
- `--context serviceDesiredCounts.worker=1` starts one worker task.

Keep `realtime` and `livekit` at `0` until their own smoke gates are ready.

## Deployment Sequence

1. Rehydrate or update the dev CDK stacks with real image push enabled:

   ```powershell
   pnpm --filter rebound-cdk exec cdk deploy --all --require-approval never --context appEnv=dev --context codeBuildDryRun=false
   ```

2. Build and push API and worker images to ECR. Use one immutable tag for both services so the ECS task definitions point at a matching source snapshot.

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
   pnpm --filter rebound-cdk exec cdk deploy Rebound-dev-Compute --require-approval never --context appEnv=dev --context imageTags.api=$tag --context imageTags.worker=$tag --context serviceDesiredCounts.api=1 --context serviceDesiredCounts.worker=1
   ```

4. Smoke ECS:

   ```powershell
   aws ecs describe-services --region us-east-2 --cluster <cluster-name> --services <api-service-name> <worker-service-name>
   aws logs tail /aws/ecs/<api-log-group> --region us-east-2 --since 30m
   aws logs tail /aws/ecs/<worker-log-group> --region us-east-2 --since 30m
   ```

## Current Risk

The current server production startup still initializes MongoDB/Mongoose before the API listener starts. Do not raise `api` or `worker` desired counts with real images until the task startup path either uses Aurora-backed runtime wiring or has an explicit, temporary smoke-only startup mode that is not treated as a production fallback.

For now, a CDK deploy with `codeBuildDryRun=false` prepares the build projects and ECR push path. The final Plan D smoke remains blocked until the real image startup path will not crash-loop in ECS.

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
