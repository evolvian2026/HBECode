terraform {
  required_version = ">= 1.6"
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 6.0, < 10.0"
    }
  }
}

# Authentication comes from ~/.oci/config (run `oci setup config` once; see README.md).
provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}
