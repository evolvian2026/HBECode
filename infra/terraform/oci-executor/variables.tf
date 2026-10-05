variable "region" {
  description = "OCI region. The pilot runs in Singapore, close to the Render services."
  type        = string
  default     = "ap-singapore-1"
}

variable "oci_profile" {
  description = "Profile in ~/.oci/config."
  type        = string
  default     = "DEFAULT"
}

variable "tenancy_ocid" {
  description = "Tenancy OCID (used to list availability domains)."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment for every resource. A dedicated `hbecode` compartment is recommended."
  type        = string
}

variable "ocpus" {
  description = "A1 cores. Always Free allows 2 OCPU / 12 GB in total per tenancy (as of 2026-06)."
  type        = number
  default     = 2
}

variable "memory_gb" {
  type    = number
  default = 12
}

variable "boot_volume_gb" {
  description = "The executor image is ~5 GB plus build cache; Always Free includes 200 GB of block storage."
  type        = number
  default     = 100
}

variable "ssh_public_key" {
  description = "Public key for the `ubuntu` user. SSH stays closed unless admin_cidr is set."
  type        = string
}

variable "admin_cidr" {
  description = "CIDR allowed to SSH in (e.g. your office IP/32). Empty = no inbound traffic at all."
  type        = string
  default     = ""
}

variable "api_url" {
  description = "Public API URL the executor pulls jobs from, e.g. https://api.example.com."
  type        = string
}

variable "executor_token" {
  description = <<-EOT
    One of the API's EXECUTOR_TOKENS (openssl rand -hex 32). Stored in Terraform state and in the
    instance's user data: keep the state file private. Leave empty to write /etc/hbe/executor.env
    on the VM yourself instead (the install then waits for it; see README.md).
  EOT
  type        = string
  default     = ""
  sensitive   = true
}

variable "executor_id" {
  type    = string
  default = "oci-sg-1"
}

variable "executor_slots" {
  description = "Jobs run in parallel. 2 matches 2 OCPU (measured in docs/phase-8-report.md)."
  type        = number
  default     = 2
}

variable "git_ref" {
  description = "Branch or tag of github.com/evolvian2026/HBECode to build the executor from."
  type        = string
  default     = "main"
}
