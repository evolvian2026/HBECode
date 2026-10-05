output "api_url" { value = "https://${local.api_domain}" }
output "app_url" { value = "https://${local.app_domain}" }
output "web_bucket" { value = module.edge.bucket }
output "cloudfront_distribution_id" { value = module.edge.distribution_id }
output "ecr_repositories" { value = { for k, r in aws_ecr_repository.this : k => r.repository_url } }
output "ecs_cluster" { value = module.control.cluster_name }
output "api_task_definition" { value = module.control.task_definition_arn }
output "db_master_secret_arn" { value = module.data.db_master_secret_arn }
output "operator_secrets" { value = { for k, s in aws_secretsmanager_secret.operator : k => s.arn } }
output "alarm_topic_arn" { value = module.observability.alarm_topic_arn }
