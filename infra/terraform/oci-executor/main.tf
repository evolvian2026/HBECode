# HBECode pilot executor: one Always Free Ampere A1 VM that pulls jobs from the API over HTTPS.
# It holds no database or Redis credentials. Inbound traffic: none (optionally SSH from admin_cidr).

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = "VM.Standard.A1.Flex"
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "oci_core_vcn" "exec" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.40.0.0/16"]
  display_name   = "hbecode-exec"
  dns_label      = "hbeexec"
}

resource "oci_core_internet_gateway" "exec" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.exec.id
  display_name   = "hbecode-exec-igw"
}

resource "oci_core_route_table" "exec" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.exec.id
  display_name   = "hbecode-exec-rt"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.exec.id
  }
}

resource "oci_core_security_list" "exec" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.exec.id
  display_name   = "hbecode-exec-sl"

  # Out: HTTPS to the API, image registries, GitHub, Ubuntu mirrors (plus DNS/NTP).
  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
    stateless   = false
  }

  dynamic "ingress_security_rules" {
    for_each = var.admin_cidr == "" ? [] : [var.admin_cidr]
    content {
      source   = ingress_security_rules.value
      protocol = "6" # TCP
      tcp_options {
        min = 22
        max = 22
      }
    }
  }
}

resource "oci_core_subnet" "exec" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.exec.id
  cidr_block                 = "10.40.1.0/24"
  display_name               = "hbecode-exec-subnet"
  dns_label                  = "exec"
  route_table_id             = oci_core_route_table.exec.id
  security_list_ids          = [oci_core_security_list.exec.id]
  prohibit_public_ip_on_vnic = false # a public IP for egress (a NAT gateway is not Always Free)
}

resource "oci_core_instance" "executor" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  display_name        = "hbecode-executor"
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gb
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.exec.id
    assign_public_ip = true
  }

  # Legacy instance metadata (IMDSv1) off.
  instance_options {
    are_legacy_imds_endpoints_disabled = true
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
      install_script = file("${path.module}/../../../deploy/oci/install-executor.sh")
      api_url        = var.api_url
      executor_token = var.executor_token
      executor_id    = var.executor_id
      executor_slots = var.executor_slots
      git_ref        = var.git_ref
    }))
  }

  lifecycle {
    # A newer Ubuntu image or edited user data must not silently replace the running executor;
    # re-run deploy/oci/install-executor.sh over SSH to update it instead.
    ignore_changes = [source_details[0].source_id, metadata["user_data"]]
  }
}
