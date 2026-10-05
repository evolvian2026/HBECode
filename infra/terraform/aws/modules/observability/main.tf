# Alarms for the signals in docs/architecture.md §17, to an SNS topic (email by default).
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 6.0, < 7.0" }
  }
}

variable "name" { type = string }
variable "alarm_email" {
  description = "Address that receives alarms (confirm the SNS subscription email once)."
  type        = string
}
variable "alb_arn_suffix" { type = string }
variable "target_group_arn_suffix" { type = string }
variable "ecs_cluster_name" { type = string }
variable "ecs_service_name" { type = string }
variable "db_cluster_id" { type = string }
variable "redis_group_id" { type = string }
variable "exec_asg_name" { type = string }

resource "aws_sns_topic" "alarms" {
  name              = "${var.name}-alarms"
  kms_master_key_id = "alias/aws/sns"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

locals {
  alarms = {
    api-5xx = {
      namespace = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", stat = "Sum", threshold = 25, period = 300, cmp = "GreaterThanThreshold"
      dims      = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
      desc      = "More than 25 API 5xx responses in 5 minutes"
    }
    api-unhealthy = {
      namespace = "AWS/ApplicationELB", metric = "UnHealthyHostCount", stat = "Maximum", threshold = 0, period = 60, cmp = "GreaterThanThreshold"
      dims      = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
      desc      = "An API task fails its health check"
    }
    api-cpu = {
      namespace = "AWS/ECS", metric = "CPUUtilization", stat = "Average", threshold = 85, period = 300, cmp = "GreaterThanThreshold"
      dims      = { ClusterName = var.ecs_cluster_name, ServiceName = var.ecs_service_name }
      desc      = "API CPU above 85 % (autoscaling at its maximum?)"
    }
    db-cpu = {
      namespace = "AWS/RDS", metric = "CPUUtilization", stat = "Average", threshold = 80, period = 300, cmp = "GreaterThanThreshold"
      dims      = { DBClusterIdentifier = var.db_cluster_id }
      desc      = "Aurora CPU above 80 %"
    }
    db-acu = {
      namespace = "AWS/RDS", metric = "ACUUtilization", stat = "Average", threshold = 90, period = 300, cmp = "GreaterThanThreshold"
      dims      = { DBClusterIdentifier = var.db_cluster_id }
      desc      = "Aurora is near its maximum capacity units"
    }
    redis-memory = {
      namespace = "AWS/ElastiCache", metric = "DatabaseMemoryUsagePercentage", stat = "Maximum", threshold = 80, period = 300, cmp = "GreaterThanThreshold"
      dims      = { ReplicationGroupId = var.redis_group_id }
      desc      = "Redis memory above 80 % (noeviction: writes fail when full)"
    }
    executors-none = {
      namespace = "AWS/AutoScaling", metric = "GroupInServiceInstances", stat = "Minimum", threshold = 1, period = 300, cmp = "LessThanThreshold"
      dims      = { AutoScalingGroupName = var.exec_asg_name }
      desc      = "No executor in service: runs and submissions queue up"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "this" {
  for_each            = local.alarms
  alarm_name          = "${var.name}-${each.key}"
  alarm_description   = each.value.desc
  namespace           = each.value.namespace
  metric_name         = each.value.metric
  statistic           = each.value.stat
  period              = each.value.period
  evaluation_periods  = 2
  threshold           = each.value.threshold
  comparison_operator = each.value.cmp
  dimensions          = each.value.dims
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

# p95 latency: the API's own target.
resource "aws_cloudwatch_metric_alarm" "api_p95" {
  alarm_name          = "${var.name}-api-p95"
  alarm_description   = "API p95 response time above 1 s for 10 minutes"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.target_group_arn_suffix }
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
}

output "alarm_topic_arn" { value = aws_sns_topic.alarms.arn }
