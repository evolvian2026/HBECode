output "executor_public_ip" {
  description = "Egress IP of the executor (no inbound ports unless admin_cidr is set)."
  value       = oci_core_instance.executor.public_ip
}

output "ssh" {
  value = var.admin_cidr == "" ? "SSH is closed (admin_cidr is empty). Use the OCI console's Cloud Shell or set admin_cidr." : "ssh ubuntu@${oci_core_instance.executor.public_ip}"
}
