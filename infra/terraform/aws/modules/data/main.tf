# Data plane: Aurora PostgreSQL Serverless v2 (writer + reader), ElastiCache (Redis, TLS + auth),
# private S3 bucket for uploads, exports and proctoring snapshots. Nothing here is reachable from
# the internet; access is by security group from the API tasks only (executors get none of it).
terraform {
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 6.0, < 7.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "client_security_group_ids" {
  description = "Security groups allowed to reach Postgres and Redis (the API service)."
  type        = list(string)
}
variable "pg_engine_version" {
  type    = string
  default = "16.6"
}
variable "pg_min_acu" {
  type    = number
  default = 0.5
}
variable "pg_max_acu" {
  type    = number
  default = 8
}
variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}
variable "snapshot_retention_days" {
  description = "Proctoring snapshots are deleted after this many days (matches the app default)."
  type        = number
  default     = 30
}

# --- security groups ----------------------------------------------------------------------------
resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "Aurora PostgreSQL: API only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "db" {
  for_each                     = toset(var.client_security_group_ids)
  security_group_id            = aws_security_group.db.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}

resource "aws_security_group" "redis" {
  name        = "${var.name}-redis"
  description = "ElastiCache: API only"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_ingress_rule" "redis" {
  for_each                     = toset(var.client_security_group_ids)
  security_group_id            = aws_security_group.redis.id
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}

# --- Aurora PostgreSQL ------------------------------------------------------------------------------
resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.private_subnet_ids
}

resource "aws_rds_cluster_parameter_group" "this" {
  name   = "${var.name}-pg16"
  family = "aurora-postgresql16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement"
    value = "500"
  }
}

resource "aws_rds_cluster" "this" {
  cluster_identifier                  = var.name
  engine                              = "aurora-postgresql"
  engine_mode                         = "provisioned"
  engine_version                      = var.pg_engine_version
  database_name                       = "hbe"
  master_username                     = "hbe_owner"
  manage_master_user_password         = true # rotated by Secrets Manager; never in state
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.db.id]
  db_cluster_parameter_group_name     = aws_rds_cluster_parameter_group.this.name
  storage_encrypted                   = true
  backup_retention_period             = 14
  preferred_backup_window             = "20:30-21:30" # 02:00–03:00 IST
  copy_tags_to_snapshot               = true
  deletion_protection                 = true
  skip_final_snapshot                 = false
  final_snapshot_identifier           = "${var.name}-final"
  enabled_cloudwatch_logs_exports     = ["postgresql"]
  iam_database_authentication_enabled = true

  serverlessv2_scaling_configuration {
    min_capacity = var.pg_min_acu
    max_capacity = var.pg_max_acu
  }
}

resource "aws_rds_cluster_instance" "this" {
  count                        = 2 # writer + reader in different AZs
  identifier                   = "${var.name}-${count.index}"
  cluster_identifier           = aws_rds_cluster.this.id
  engine                       = aws_rds_cluster.this.engine
  engine_version               = aws_rds_cluster.this.engine_version
  instance_class               = "db.serverless"
  performance_insights_enabled = true
  auto_minor_version_upgrade   = true
}

# Password of the application role (hbe_app, created by the migration CLI with RLS enforced).
resource "random_password" "app" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "app_db" {
  name = "${var.name}/db/hbe_app"
}

resource "aws_secretsmanager_secret_version" "app_db" {
  secret_id = aws_secretsmanager_secret.app_db.id
  secret_string = jsonencode({
    password     = random_password.app.result
    DATABASE_URL = "postgres://hbe_app:${random_password.app.result}@${aws_rds_cluster.this.endpoint}:5432/hbe?sslmode=require"
  })
}

# --- ElastiCache ----------------------------------------------------------------------------------
resource "random_password" "redis" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "redis" {
  name = "${var.name}/redis"
}

resource "aws_secretsmanager_secret_version" "redis" {
  secret_id = aws_secretsmanager_secret.redis.id
  secret_string = jsonencode({
    REDIS_URL = "rediss://:${random_password.redis.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  })
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.private_subnet_ids
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = var.name
  description                = "HBECode dispatch lists, rate limits, pub/sub"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.redis_node_type
  num_cache_clusters         = 2
  automatic_failover_enabled = true
  multi_az_enabled           = true
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.redis.result
  snapshot_retention_limit   = 1
  # The queue must never silently drop keys (the API relies on Postgres as source of truth anyway).
  parameter_group_name = "default.redis7"
}

# --- S3 ---------------------------------------------------------------------------------------------
resource "aws_s3_bucket" "files" {
  bucket_prefix = "${var.name}-files-"
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "files" {
  bucket = aws_s3_bucket.files.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    id     = "snapshots"
    status = "Enabled"
    filter {
      prefix = "snapshots/"
    }
    expiration {
      days = var.snapshot_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

data "aws_iam_policy_document" "files_tls" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.files.arn, "${aws_s3_bucket.files.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "files" {
  bucket = aws_s3_bucket.files.id
  policy = data.aws_iam_policy_document.files_tls.json
}

output "db_endpoint" { value = aws_rds_cluster.this.endpoint }
output "db_reader_endpoint" { value = aws_rds_cluster.this.reader_endpoint }
output "db_master_secret_arn" { value = aws_rds_cluster.this.master_user_secret[0].secret_arn }
output "app_db_secret_arn" { value = aws_secretsmanager_secret.app_db.arn }
output "redis_secret_arn" { value = aws_secretsmanager_secret.redis.arn }
output "files_bucket" { value = aws_s3_bucket.files.bucket }
output "files_bucket_arn" { value = aws_s3_bucket.files.arn }
output "db_cluster_id" { value = aws_rds_cluster.this.cluster_identifier }
output "redis_group_id" { value = aws_elasticache_replication_group.this.id }
