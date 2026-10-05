# HBECode on AWS (docs/architecture.md §16): the same images as the pilot, larger and redundant.
# Secrets with operator-supplied values (JWT key, MFA key, executor token) are created empty here
# and filled with `aws secretsmanager put-secret-value`, so their values never enter Terraform state.

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  app_domain = "app.${var.domain}"
  api_domain = "api.${var.domain}"
}

module "network" {
  source = "../../modules/network"
  name   = var.name
  azs    = slice(data.aws_availability_zones.available.names, 0, 3)
}

# The API's security group lives here so both the data and the compute module can reference it.
resource "aws_security_group" "api" {
  name        = "${var.name}-api"
  description = "API tasks"
  vpc_id      = module.network.vpc_id
}

resource "aws_vpc_security_group_egress_rule" "api_all" {
  security_group_id = aws_security_group.api.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

module "data" {
  source                    = "../../modules/data"
  name                      = var.name
  vpc_id                    = module.network.vpc_id
  private_subnet_ids        = module.network.private_subnet_ids
  client_security_group_ids = [aws_security_group.api.id]
}

# --- container registry ---------------------------------------------------------------------------
resource "aws_ecr_repository" "this" {
  for_each             = toset(["hbe-api", "hbe-executor"])
  name                 = each.key
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "KMS"
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

# --- operator-supplied secrets (values set out of band) ---------------------------------------------
resource "aws_secretsmanager_secret" "operator" {
  for_each = toset(["jwt-private-key", "mfa-encryption-key", "executor-token"])
  name     = "${var.name}/${each.key}"
}

# --- certificates (DNS-validated in Route 53) --------------------------------------------------------
resource "aws_acm_certificate" "api" {
  domain_name       = local.api_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate" "app" {
  provider          = aws.us_east_1
  domain_name       = local.app_domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

locals {
  validations = merge(
    { for o in aws_acm_certificate.api.domain_validation_options : "api" => o },
    { for o in aws_acm_certificate.app.domain_validation_options : "app" => o },
  )
}

resource "aws_route53_record" "validation" {
  for_each        = local.validations
  zone_id         = var.route53_zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "api" {
  certificate_arn         = aws_acm_certificate.api.arn
  validation_record_fqdns = [aws_route53_record.validation["api"].fqdn]
}

resource "aws_acm_certificate_validation" "app" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.app.arn
  validation_record_fqdns = [aws_route53_record.validation["app"].fqdn]
}

# --- compute ----------------------------------------------------------------------------------------
module "control" {
  source                = "../../modules/compute-control"
  name                  = var.name
  vpc_id                = module.network.vpc_id
  public_subnet_ids     = module.network.public_subnet_ids
  private_subnet_ids    = module.network.private_subnet_ids
  api_security_group_id = aws_security_group.api.id
  image                 = "${aws_ecr_repository.this["hbe-api"].repository_url}:${var.api_image_tag}"
  certificate_arn       = aws_acm_certificate_validation.api.certificate_arn
  files_bucket_arn      = module.data.files_bucket_arn
  environment = {
    WEB_ORIGINS        = "https://${local.app_domain}"
    WEB_URL            = "https://${local.app_domain}"
    DATABASE_POOL_SIZE = "10"
    REPORT_TIMEZONE    = "Asia/Kolkata"
  }
  secrets = {
    DATABASE_URL       = "${module.data.app_db_secret_arn}:DATABASE_URL::"
    REDIS_URL          = "${module.data.redis_secret_arn}:REDIS_URL::"
    JWT_PRIVATE_KEY    = aws_secretsmanager_secret.operator["jwt-private-key"].arn
    MFA_ENCRYPTION_KEY = aws_secretsmanager_secret.operator["mfa-encryption-key"].arn
    EXECUTOR_TOKENS    = aws_secretsmanager_secret.operator["executor-token"].arn
  }
  secret_arns = [
    module.data.app_db_secret_arn,
    module.data.redis_secret_arn,
    aws_secretsmanager_secret.operator["jwt-private-key"].arn,
    aws_secretsmanager_secret.operator["mfa-encryption-key"].arn,
    aws_secretsmanager_secret.operator["executor-token"].arn,
  ]
}

module "exec" {
  source                    = "../../modules/compute-exec"
  name                      = var.name
  vpc_id                    = module.network.vpc_id
  private_subnet_ids        = module.network.private_subnet_ids
  api_url                   = "https://${local.api_domain}"
  executor_token_secret_arn = aws_secretsmanager_secret.operator["executor-token"].arn
  executor_image            = "${aws_ecr_repository.this["hbe-executor"].repository_url}:${var.executor_image_tag}"
  ecr_repository_arn        = aws_ecr_repository.this["hbe-executor"].arn
  git_ref                   = var.git_ref
  scheduled_capacity        = var.executor_schedule
}

module "edge" {
  source          = "../../modules/edge"
  providers       = { aws = aws, aws.us_east_1 = aws.us_east_1 }
  name            = var.name
  domain          = local.app_domain
  certificate_arn = aws_acm_certificate_validation.app.certificate_arn
}

module "observability" {
  source                  = "../../modules/observability"
  name                    = var.name
  alarm_email             = var.alarm_email
  alb_arn_suffix          = module.control.alb_arn_suffix
  target_group_arn_suffix = module.control.target_group_arn_suffix
  ecs_cluster_name        = module.control.cluster_name
  ecs_service_name        = module.control.service_name
  db_cluster_id           = module.data.db_cluster_id
  redis_group_id          = module.data.redis_group_id
  exec_asg_name           = module.exec.asg_name
}

# --- DNS ------------------------------------------------------------------------------------------
resource "aws_route53_record" "api" {
  zone_id = var.route53_zone_id
  name    = local.api_domain
  type    = "A"
  alias {
    name                   = module.control.alb_dns_name
    zone_id                = module.control.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "app" {
  zone_id = var.route53_zone_id
  name    = local.app_domain
  type    = "A"
  alias {
    name                   = module.edge.distribution_domain
    zone_id                = module.edge.distribution_zone_id
    evaluate_target_health = false
  }
}
