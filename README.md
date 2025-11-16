# CDK Deployment Library

A configuration-driven AWS CDK library for deploying serverless applications with Lambda functions, DynamoDB tables, API Gateway, and custom domains.

## Overview

This project provides a reusable CDK stack (`LambdaStack`) that automates the deployment of serverless web applications to AWS. It supports multiple Lambda functions, DynamoDB tables, HTTP API Gateway, custom domains with SSL certificates, AWS Secrets Manager integration, and New Relic monitoring.

## Project Structure

```
.
├── cdk/                    # CDK infrastructure code (TypeScript)
│   ├── bin/               # CDK app entry point
│   ├── lib/               # Stack and configuration modules
│   ├── config/            # Environment-specific configuration files
│   └── scripts/           # Utility scripts (secrets management)
├── mulio/                 # Flask application (Lambda function code)
│   ├── app.py            # Flask application
│   ├── lambda_function.py # Lambda handler
│   └── auth/             # Authentication modules
├── layers/                # Lambda layers
│   └── python-dependencies/ # Python dependencies layer
└── scripts/               # Build and deployment scripts
```

## Features

- **Multi-Lambda Support**: Deploy multiple Lambda functions with individual configurations
- **DynamoDB Integration**: Automatic table creation with GSI/LSI support
- **API Gateway**: HTTP API Gateway with custom domain support
- **Secrets Management**: AWS Secrets Manager integration with automatic secret generation
- **Monitoring**: New Relic Lambda layer support
- **Tagging**: Standardized resource tagging with namespace/environment/stage
- **Flexible Deployment**: Support for API Gateway or Lambda Function URLs

## Prerequisites

- Node.js 18+ and npm
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`
- Python 3.13+ (for Lambda functions)
- Docker (optional, for building Lambda layers)

## Quick Start

1. **Install dependencies:**
   ```bash
   cd cdk
   npm install
   ```

2. **Build Python Lambda layer:**
   ```bash
   ../scripts/build-layer.sh
   ```

3. **Configure your environment:**
   Edit `cdk/config/dev.json` with your AWS account, region, and application settings.

4. **Populate secrets (if needed):**
   ```bash
   cd cdk
   npm run secrets:populate
   ```

5. **Deploy:**
   ```bash
   npm run deploy
   # Or use the deployment script:
   ../scripts/deploy.sh
   ```

## Configuration

Configuration is defined in JSON files under `cdk/config/`. The main configuration includes:

- **Application settings**: app name, environment, AWS account/region
- **Lambda functions**: runtime, handler, memory, timeout, routes, layers
- **DynamoDB tables**: partition/sort keys, billing mode, indexes
- **API Gateway**: routes, custom domain configuration
- **Secrets**: fields to store in AWS Secrets Manager
- **New Relic**: monitoring configuration
- **Tags**: resource tagging strategy

Example configuration structure:
```json
{
  "appName": "MyApp",
  "environment": "dev",
  "account": "123456789012",
  "region": "us-east-1",
  "lambdas": [...],
  "dynamodb": {...},
  "deploymentType": "api-gateway"
}
```

## Key Components

### Lambda Stack (`cdk/lib/lambda-stack.ts`)
The main CDK stack that creates:
- Lambda functions with layers and environment variables
- DynamoDB tables with indexes
- API Gateway HTTP API with routes
- Custom domains with SSL certificates (optional)
- CloudWatch Log Groups
- IAM roles and policies
- AWS Secrets Manager secrets

### Configuration System (`cdk/lib/config/`)
- Type-safe configuration types
- Configuration loaders and validators
- Default value application
- Tag normalization and validation

### Flask Application (`mulio/`)
A sample Flask application demonstrating:
- OIDC authentication with Authlib
- DynamoDB integration
- Secrets retrieval from AWS Secrets Manager
- WSGI adapter for Lambda (`apig-wsgi`)

## Scripts

- **`scripts/build-layer.sh`**: Builds Python dependencies Lambda layer
- **`scripts/deploy.sh`**: Full deployment workflow
- **`cdk/scripts/manage-secrets.ts`**: Secrets management utility

## Environment Variables

Lambda functions automatically receive:
- `ENVIRONMENT`, `APP_NAME`
- `DYNAMODB_TABLE_NAME` (primary table)
- `DYNAMODB_TABLES` (JSON map of all tables)
- `SECRETS_ARN` (if secrets are configured)
- `OIDC_*` variables (if OIDC is configured)
- `NEW_RELIC_*` variables (if New Relic is enabled)

## Deployment Types

- **`api-gateway`**: Deploy with HTTP API Gateway (default)
- **`lambda-function-url`**: Deploy with Lambda Function URLs

## Development

```bash
# Watch for TypeScript changes
cd cdk
npm run watch

# Synthesize CloudFormation template
npm run synth

# View differences
npm run diff
```

## License

[Add your license here]

