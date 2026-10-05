# Pilot executor on Oracle Cloud Always Free (Terraform)

Creates what [docs/deployment.md §4](../../../docs/deployment.md#executor) describes by hand:

- a VCN with one public subnet whose security list allows **no inbound traffic** (SSH only if you set `admin_cidr`);
- one **VM.Standard.A1.Flex** (2 OCPU / 12 GB, Ubuntu 24.04, 100 GB boot volume, legacy IMDS off);
- cloud-init that runs [`deploy/oci/install-executor.sh`](../../../deploy/oci/install-executor.sh): Docker, the executor image (built on the VM, about 15 minutes), the PostgreSQL/MySQL/MongoDB runners on an internal network, and the executor itself.

Everything fits in Always Free (as of 2026-06: 2 OCPU / 12 GB of A1 and 200 GB of block storage per tenancy).

## Before you start (sign-ins you need)

1. An **Oracle Cloud** account (Always Free). Card needed for identity verification.
2. The OCI CLI config on your laptop: `oci setup config` creates `~/.oci/config` and an API signing key; upload the public key under *Profile → API keys*. Terraform reads that file — no credentials go into this directory.
3. A compartment for HBECode (*Identity → Compartments*); note its OCID and your tenancy OCID.
4. The API already deployed (Render, `docs/deployment.md` §3) and an executor token in its `EXECUTOR_TOKENS`.

## Apply

```bash
cd infra/terraform/oci-executor
cat > terraform.tfvars <<'EOF'
tenancy_ocid     = "ocid1.tenancy.oc1..…"
compartment_ocid = "ocid1.compartment.oc1..…"
ssh_public_key   = "ssh-ed25519 AAAA… you@laptop"
api_url          = "https://api.<domain>"
git_ref          = "main"
# admin_cidr     = "203.0.113.7/32"   # only if you want SSH from your IP
EOF
terraform init
terraform apply
```

**The executor token.** Either:

- pass it as `TF_VAR_executor_token=… terraform apply` — simplest, but it is then stored in Terraform state and in the instance's user data (readable from the VM only). Keep `terraform.tfstate` private (it is git-ignored); or
- leave it empty. The VM then waits until you create `/etc/hbe/executor.env` yourself (OCI Console → the instance → *Cloud Shell* / SSH):
  ```bash
  sudo sh -c 'umask 077; printf "HBE_API_URL=https://api.<domain>\nHBE_EXECUTOR_TOKEN=%s\n" "<token>" > /etc/hbe/executor.env'
  ```

Progress is in `/var/log/hbe-install.log` on the VM; the executor shows up on the Platform page of the app once it claims work.

"Out of host capacity" for A1 is common in busy regions: re-run `terraform apply` later, or set another availability domain.

## Update, roll back, destroy

- **Update** the executor to a new version: on the VM, `sudo HBE_REF=<tag> bash /opt/hbe-install/install-executor.sh`. Terraform ignores later changes to the image and user data on purpose, so a `terraform apply` never replaces a working executor.
- **Roll back:** the same command with the previous ref.
- **Rebuild from scratch** (for example after a suspected sandbox escape): rotate the executor token in the API first, then `terraform apply -replace=oci_core_instance.executor`.
- **Destroy:** `terraform destroy`.

`terraform validate` runs in CI (`.github/workflows/ci.yml`, job *Terraform*).
