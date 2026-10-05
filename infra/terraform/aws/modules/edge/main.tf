# Edge: the static web app (Next.js export) in a private S3 bucket behind CloudFront, with the same
# security headers as render.yaml and an AWS WAF. CloudFront-scoped WAF and certificates live in
# us-east-1, so the caller passes that provider as aws.us_east_1.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = ">= 6.0, < 7.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}

variable "name" { type = string }
variable "domain" {
  description = "app.<domain>"
  type        = string
}
variable "certificate_arn" {
  description = "ACM certificate in us-east-1 for the app domain."
  type        = string
}
variable "price_class" {
  description = "PriceClass_200 includes India edge locations."
  type        = string
  default     = "PriceClass_200"
}

resource "aws_s3_bucket" "web" {
  bucket_prefix = "${var.name}-web-"
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# /practice/ → /practice/index.html (the export writes one index.html per route).
resource "aws_cloudfront_function" "index" {
  name    = "${var.name}-index"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = <<-JS
    function handler(event) {
      var r = event.request;
      if (r.uri.endsWith('/')) r.uri += 'index.html';
      else if (!r.uri.split('/').pop().includes('.')) r.uri += '/index.html';
      return r;
    }
  JS
}


resource "aws_cloudfront_response_headers_policy" "app" {
  name = "${var.name}-app"
  security_headers_config {
    content_security_policy {
      # The full policy is a <meta> tag in every page (with hashes for Next's inline scripts, see
      # apps/web/scripts/csp.mjs); a second script-src here would block them. Headers carry only
      # what <meta> cannot, as in render.yaml.
      content_security_policy = "frame-ancestors 'none'"
      override                = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    content_type_options {
      override = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
  }
  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(self), microphone=(), geolocation=(), payment=()"
      override = true
    }
  }
}

# The web-question preview frame runs student HTML/JS: framed by our own pages only.
resource "aws_cloudfront_response_headers_policy" "preview" {
  name = "${var.name}-preview"
  security_headers_config {
    content_security_policy {
      content_security_policy = "frame-ancestors 'self'" # the frame's own strict policy is in its <meta>
      override                = true
    }
    frame_options {
      frame_option = "SAMEORIGIN"
      override     = true
    }
    content_type_options {
      override = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
  }
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

resource "aws_wafv2_web_acl" "web" {
  provider = aws.us_east_1
  name     = "${var.name}-web"
  scope    = "CLOUDFRONT"
  default_action {
    allow {}
  }
  rule {
    name     = "aws-common"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-common"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "rate-limit"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 20000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-web"
    sampled_requests_enabled   = true
  }
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  aliases             = [var.domain]
  default_root_object = "index.html"
  price_class         = var.price_class
  web_acl_id          = aws_wafv2_web_acl.web.arn
  http_version        = "http2and3"

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    target_origin_id           = "s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.app.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.index.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/preview/*"
    target_origin_id           = "s3"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.preview.id
  }

  custom_error_response {
    error_code         = 403 # S3 answers 403 for missing keys behind OAC
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

data "aws_iam_policy_document" "web" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web.json
}

output "bucket" { value = aws_s3_bucket.web.bucket }
output "distribution_id" { value = aws_cloudfront_distribution.web.id }
output "distribution_domain" { value = aws_cloudfront_distribution.web.domain_name }
output "distribution_zone_id" { value = aws_cloudfront_distribution.web.hosted_zone_id }
