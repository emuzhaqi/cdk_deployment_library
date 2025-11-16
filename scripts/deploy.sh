#!/bin/bash

# Mulio AWS CDK Deployment Script

set -e

echo "🚀 Starting Mulio deployment to AWS..."

# Navigate to CDK directory
cd cdk

# Install dependencies
echo "📦 Installing CDK dependencies..."
npm install

# Build the Lambda layer
echo "🔧 Building Lambda layer..."
cd ../lambda-layer

# Create python directory if it doesn't exist
mkdir -p python

# Install dependencies to python directory for ARM64 architecture using Docker
echo "🐳 Building ARM64 dependencies using Docker..."
docker run --rm -it -v "$PWD":/var/task --entrypoint bash public.ecr.aws/lambda/python:3.11 -c "cd /var/task && pip install -r requirements.txt -t lambda-layer/python/"

# Remove unnecessary files to reduce layer size
find python/ -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find python/ -type f -name "*.pyc" -delete 2>/dev/null || true
find python/ -type f -name "*.pyo" -delete 2>/dev/null || true
find python/ -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true

cd ../cdk

# Synthesize the stack
echo "🔍 Synthesizing CloudFormation template..."
cdk synth

# Deploy the stack
echo "🚀 Deploying to AWS..."
cdk deploy --require-approval never

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Update the environment variables in the Lambda function with your actual Keycloak configuration"
echo "2. Test your API endpoints"
echo "3. Configure your Keycloak client with the API Gateway URL as a redirect URI"
