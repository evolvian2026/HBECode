# Execution plane: an Auto Scaling group of executor VMs (Graviton) in private subnets. They pull
# jobs from the API over HTTPS with a bearer token; they have no route to Postgres, Redis or S3 and
# no inbound ports (admin access through SSM Session Manager). Untrusted code runs in nsjail.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = ">= 6.0, < 7.0" }
  }
}

variable "name" { type = string }
variable "vpc_id" { type = string }
variable "private_subnet_ids" { type = list(string) }
variable "api_url" {
  description = "Public API URL the executors pull from (https://api.<domain>)."
  type        = string
}
variable "executor_token_secret_arn" {
  description = "Secrets Manager secret whose value is this fleet's executor token."
  type        = string
}
variable "executor_image" {
  description = "Prebuilt executor image in ECR (<account>.dkr.ecr.<region>.amazonaws.com/hbe-executor:<sha>)."
  type        = string
}
variable "ecr_repository_arn" { type = string }
variable "git_ref" {
  description = "Repo ref the install script and runner image pins are read from."
  type        = string
  default     = "main"
}
variable "instance_type" {
  description = "c7g.xlarge = 4 vCPU / 8 GB (Graviton, the executor image is multi-arch)."
  type        = string
  default     = "c7g.xlarge"
}
variable "slots_per_instance" {
  type    = number
  default = 4
}
variable "min_size" {
  type    = number
  default = 1
}
variable "max_size" {
  type    = number
  default = 8
}
variable "scheduled_capacity" {
  description = "Scale up before known test windows, e.g. { exam_mon = { recurrence = \"15 3 * * MON\", min = 4, max = 8, desired = 4 } } (UTC cron)."
  type = map(object({
    recurrence = string
    min        = number
    max        = number
    desired    = number
  }))
  default = {}
}

data "aws_region" "current" {}

data "aws_ssm_parameter" "ubuntu" {
  name = "/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
}

resource "aws_security_group" "exec" {
  name        = "${var.name}-exec"
  description = "Executors: no inbound; outbound HTTPS (API, ECR, package mirrors) via NAT"
  vpc_id      = var.vpc_id
}

resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.exec.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
}

resource "aws_vpc_security_group_egress_rule" "http" {
  description       = "Ubuntu package mirrors"
  security_group_id = aws_security_group.exec.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "exec" {
  name               = "${var.name}-exec"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.exec.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "exec" {
  statement {
    sid       = "ExecutorToken"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [var.executor_token_secret_arn]
  }
  statement {
    sid       = "PullExecutorImage"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [var.ecr_repository_arn]
  }
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "exec" {
  role   = aws_iam_role.exec.id
  policy = data.aws_iam_policy_document.exec.json
}

resource "aws_iam_instance_profile" "exec" {
  name = "${var.name}-exec"
  role = aws_iam_role.exec.name
}

locals {
  registry  = split("/", var.executor_image)[0]
  user_data = <<-EOT
    #!/bin/bash
    set -euo pipefail
    exec >> /var/log/hbe-install.log 2>&1
    snap install aws-cli --classic
    apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q docker.io git
    systemctl enable --now docker
    install -d -m 0700 /etc/hbe
    TOKEN=$(aws secretsmanager get-secret-value --region ${data.aws_region.current.region} --secret-id '${var.executor_token_secret_arn}' --query SecretString --output text)
    printf 'HBE_API_URL=%q\nHBE_EXECUTOR_TOKEN=%q\n' '${var.api_url}' "$TOKEN" > /etc/hbe/executor.env
    chmod 0600 /etc/hbe/executor.env
    aws ecr get-login-password --region ${data.aws_region.current.region} | docker login --username AWS --password-stdin ${local.registry}
    ID=$(cat /var/lib/cloud/data/instance-id)
    curl -fsSL 'https://raw.githubusercontent.com/evolvian2026/HBECode/${var.git_ref}/deploy/oci/install-executor.sh' -o /root/install-executor.sh
    HBE_EXECUTOR_IMAGE='${var.executor_image}' HBE_EXECUTOR_ID="$ID" HBE_EXECUTOR_SLOTS='${var.slots_per_instance}' HBE_REF='${var.git_ref}' bash /root/install-executor.sh
  EOT
}

resource "aws_launch_template" "exec" {
  name_prefix   = "${var.name}-exec-"
  image_id      = data.aws_ssm_parameter.ubuntu.value
  instance_type = var.instance_type
  user_data     = base64encode(local.user_data)

  iam_instance_profile {
    arn = aws_iam_instance_profile.exec.arn
  }

  network_interfaces {
    associate_public_ip_address = false
    security_groups             = [aws_security_group.exec.id]
  }

  # IMDSv2 only, hop limit 1: containers on the host (and anything escaping a sandbox into one)
  # cannot reach the instance credentials.
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    http_endpoint               = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/sda1"
    ebs {
      volume_size           = 60
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${var.name}-executor" }
  }
}

resource "aws_autoscaling_group" "exec" {
  name                      = "${var.name}-exec"
  vpc_zone_identifier       = var.private_subnet_ids
  min_size                  = var.min_size
  max_size                  = var.max_size
  health_check_type         = "EC2"
  health_check_grace_period = 900 # image pull + warm-up
  default_instance_warmup   = 600
  termination_policies      = ["OldestLaunchTemplate", "OldestInstance"]

  launch_template {
    id      = aws_launch_template.exec.id
    version = aws_launch_template.exec.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
    }
  }

  lifecycle {
    ignore_changes = [desired_capacity] # owned by scaling policies
  }
}

# CPU is a fair proxy for queue pressure: idle executors sit near 0 %, saturated ones near 100 %.
resource "aws_autoscaling_policy" "cpu" {
  name                   = "${var.name}-exec-cpu"
  autoscaling_group_name = aws_autoscaling_group.exec.name
  policy_type            = "TargetTrackingScaling"
  target_tracking_configuration {
    target_value = 60
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
  }
}

resource "aws_autoscaling_schedule" "this" {
  for_each               = var.scheduled_capacity
  scheduled_action_name  = each.key
  autoscaling_group_name = aws_autoscaling_group.exec.name
  recurrence             = each.value.recurrence
  min_size               = each.value.min
  max_size               = each.value.max
  desired_capacity       = each.value.desired
}

output "asg_name" { value = aws_autoscaling_group.exec.name }
output "security_group_id" { value = aws_security_group.exec.id }
