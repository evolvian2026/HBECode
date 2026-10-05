variable "region" {
  type    = string
  default = "ap-south-1" # Mumbai
}

variable "name" {
  type    = string
  default = "hbecode"
}

variable "domain" {
  description = "Registrable domain, e.g. example.com (app.<domain> and api.<domain> are created)."
  type        = string
}

variable "route53_zone_id" {
  description = "Hosted zone of the domain in Route 53."
  type        = string
}

variable "api_image_tag" {
  description = "Tag of hbe-api in ECR to run (CI pushes the git SHA)."
  type        = string
}

variable "executor_image_tag" {
  type = string
}

variable "git_ref" {
  description = "Ref the executors read deploy/oci/install-executor.sh and the runner image pins from."
  type        = string
  default     = "main"
}

variable "alarm_email" {
  type = string
}

variable "executor_schedule" {
  description = "Scheduled executor capacity before test windows (see modules/compute-exec)."
  type = map(object({
    recurrence = string
    min        = number
    max        = number
    desired    = number
  }))
  default = {}
}
