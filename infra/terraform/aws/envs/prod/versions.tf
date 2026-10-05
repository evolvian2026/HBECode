terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = ">= 6.0, < 7.0" }
    random = { source = "hashicorp/random", version = ">= 3.6" }
  }
  # Remote state (create the bucket once; encryption + native locking):
  # backend "s3" {
  #   bucket       = "<your-tf-state-bucket>"
  #   key          = "hbecode/prod.tfstate"
  #   region       = "ap-south-1"
  #   encrypt      = true
  #   use_lockfile = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Project = "hbecode", Environment = "prod", ManagedBy = "terraform" }
  }
}

# CloudFront certificates and CloudFront-scoped WAF must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = { Project = "hbecode", Environment = "prod", ManagedBy = "terraform" }
  }
}
