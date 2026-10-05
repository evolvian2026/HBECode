# HBECode on AWS (Terraform)

The target architecture from [docs/architecture.md §16](../../../docs/architecture.md#16-aws-target-architecture-and-migration), for when the pilot outgrows the free tiers. Same images, same code; only the hosting changes.

```
envs/prod            wires the modules for one environment (ap-south-1, Mumbai)
modules/network      VPC over 3 AZs, public/private subnets, NAT, S3 gateway endpoint, flow logs (rejects)
modules/data         Aurora PostgreSQL Serverless v2 (writer + reader, encrypted, TLS forced, 14-day backups,
                     master password managed by Secrets Manager), ElastiCache Redis (TLS + auth token, multi-AZ),
                     private S3 bucket (KMS, versioned, TLS-only, snapshots expire after 30 days)
modules/compute-control  API on ECS Fargate (ARM64, read-only root FS, uid 65532, no capabilities) behind an
                     ALB (TLS 1.2+/1.3 policy, HTTP→HTTPS) with a regional WAF (rate limit + AWS managed rules);
                     CPU target tracking 2–6 tasks; deployment circuit breaker with rollback
modules/compute-exec Executor Auto Scaling group (Graviton c7g, private subnets, no inbound, IMDSv2 hop limit 1,
                     SSM instead of SSH); pulls the prebuilt executor image from ECR; CPU target tracking plus
                     scheduled capacity before known test windows
modules/edge         Web app: private S3 + CloudFront (OAC), the same security headers as render.yaml, a
                     CloudFront WAF, index.html rewrite for the static export
modules/observability SNS alarm topic + alarms: 5xx, unhealthy targets, p95 latency, CPU, Aurora capacity,
                     Redis memory, no executor in service
```

**Not applied yet.** It has been checked with `terraform fmt` and `terraform validate` (CI job *Terraform*), not against a real account. Expect a first apply to need small fixes (service quotas, engine versions available in the region).

## Secrets

Nothing secret is written in `.tf` files, and operator-chosen secrets never enter state:

- The Aurora master password is managed by Secrets Manager (`manage_master_user_password`).
- The `hbe_app` and Redis passwords are generated (`random_password`), so they are in state. Use an encrypted S3 backend (commented block in `envs/prod/versions.tf`).
- `jwt-private-key`, `mfa-encryption-key` and `executor-token` are created **empty**; fill them once:
  ```bash
  aws secretsmanager put-secret-value --secret-id hbecode/jwt-private-key --secret-string file://jwt.pem
  aws secretsmanager put-secret-value --secret-id hbecode/mfa-encryption-key --secret-string "$(openssl rand -base64 32)"
  aws secretsmanager put-secret-value --secret-id hbecode/executor-token --secret-string "$(openssl rand -hex 32)"
  ```
  The **MFA key must be the pilot's existing key** if you migrate data from the pilot (TOTP secrets are encrypted with it).

## First deployment

1. Sign-ins: an AWS account with admin rights for the first apply, and the domain's hosted zone in Route 53.
2. `cp envs/prod/terraform.tfvars.example envs/prod/terraform.tfvars` and fill it in.
3. Build and push the images (multi-arch or arm64) to the ECR repositories (output `ecr_repositories`), tagged with the git SHA:
   `docker buildx build --platform linux/arm64 -f apps/api/Dockerfile -t <repo>/hbe-api:<sha> --push .` (same for `apps/executor/Dockerfile`).
4. `terraform -chdir=envs/prod init && terraform -chdir=envs/prod apply` (two passes are normal while ACM validates).
5. Run the migrations once as a one-off task (same task definition, other command):
   ```bash
   aws ecs run-task --cluster hbecode --launch-type FARGATE --task-definition <api_task_definition> \
     --network-configuration 'awsvpcConfiguration={subnets=[<private-subnet>],securityGroups=[<api-sg>]}' \
     --overrides '{"containerOverrides":[{"name":"api","command":["node","node_modules/@hbe/db/dist/cli/migrate.js"],
       "environment":[{"name":"DATABASE_ADMIN_URL","value":"<from the master secret>"},{"name":"HBE_APP_DB_PASSWORD","value":"<from hbecode/db/hbe_app>"}]}]}'
   ```
6. Build the web app with `NEXT_PUBLIC_API_URL=https://api.<domain>`, `aws s3 sync apps/web/out s3://<web_bucket> --delete`, then invalidate CloudFront.
7. Migrating from the pilot: [architecture §16](../../../docs/architecture.md#16-aws-target-architecture-and-migration) and the restore steps in [docs/runbooks.md](../../../docs/runbooks.md#restore).

## Cost notes

The always-on baseline is roughly: NAT gateway, ALB, 2 Fargate tasks (0.5 vCPU), Aurora at 0.5 ACU minimum ×2, 2 small ElastiCache nodes, 1 executor. Scale executors to zero outside test windows by setting `min_size = 0` and using `executor_schedule`. Check the AWS pricing calculator for current numbers; nothing here was priced against a real bill.
