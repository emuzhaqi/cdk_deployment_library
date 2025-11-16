/**
 * Type definitions for deployment configuration
 */

/**
 * Lambda layer configuration
 */
export interface LambdaLayerConfig {
    // Path to layer code (relative to CDK directory)
    path: string;
    // Description for the layer
    description?: string;
    // Compatible runtimes (defaults to match Lambda runtime)
    compatibleRuntimes?: string[];
}

/**
 * Secret field configuration
 */
export interface SecretField {
    // Secret key name (e.g., 'SECRET_KEY', 'OIDC_CLIENT_SECRET')
    key: string;
    // Human-readable description for prompting
    description: string;
    // How to obtain the value: 'random' generates automatically, 'prompt' asks user
    generator?: 'random' | 'prompt';
}

/**
 * Secrets configuration for a Lambda function
 */
export interface SecretsConfig {
    // Array of secret fields this Lambda needs
    fields: SecretField[];
}

/**
 * API Gateway route configuration
 */
export interface ApiRouteConfig {
    // Path pattern (e.g., '/', '/api/{proxy+}', '/users')
    path: string;
    // HTTP methods (e.g., ['GET', 'POST'] or ['ANY'])
    methods: string[];
}

/**
 * Lambda function configuration
 */
export interface LambdaFunctionConfig {
    // Unique identifier for this Lambda (used in resource names)
    id: string;

    // Lambda handler (e.g., 'lambda_function.lambda_handler')
    handler: string;

    // Path to Lambda code (relative to CDK directory)
    codePath: string;

    // Runtime (e.g., 'python3.13', 'nodejs20.x')
    runtime?: string;

    // Architecture ('arm64' or 'x86_64')
    architecture?: 'arm64' | 'x86_64';

    // Memory size in MB
    memory?: number;

    // Timeout in seconds (or fraction for minutes, e.g., 0.5 = 30 seconds)
    timeout?: number;

    // Description for the Lambda function
    description?: string;

    // Code exclusions (files/directories to exclude from deployment)
    exclude?: string[];

    // Lambda layers to attach
    layers?: LambdaLayerConfig[];

    // Environment variables (in addition to auto-generated ones)
    environment?: Record<string, string>;

    // API Gateway routes for this Lambda
    // If not specified and using API Gateway, defaults to catch-all proxy
    routes?: ApiRouteConfig[];

    // DynamoDB tables this Lambda needs access to
    // Can be table names or '*' for all tables
    tableAccess?: string[];

    // Whether this Lambda needs access to secrets
    needsSecrets?: boolean;

    // Secrets configuration (defines which secrets this Lambda requires)
    secretsConfig?: SecretsConfig;

    // Custom IAM policy statements
    customPolicies?: any[];

    // Whether to bundle Python dependencies from requirements.txt
    // Only applies to Python runtimes. Defaults to true.
    // Set to false if dependencies are pre-installed or using layers
    bundleDependencies?: boolean;

    // New Relic monitoring configuration for this Lambda
    newRelic?: NewRelicLambdaConfig;
}

/**
 * New Relic Lambda-specific overrides
 */
export interface NewRelicLambdaConfig {
    // Enable New Relic Lambda Extension layer (infrastructure monitoring)
    enabled?: boolean;

    licenseKey?: string;

    accountId?: string;

    // Log Enabled
    logEnabled?: boolean;

    // Send function logs to New Relic
    sendFunctionLogs?: boolean;

    // Log level for New Relic agent
    logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

    // Computed layer ARN
    layerArn?: string;
}

export interface RemovalPolicyConfig {
    table?: 'destroy' | 'retain';
    secrets?: 'destroy' | 'retain';
    logGroup?: 'destroy' | 'retain';
    lambdaLayer?: 'destroy' | 'retain';
}

/**
 * DynamoDB table key attribute configuration
 */
export interface AttributeConfig {
    name: string;
    type: 'string' | 'number' | 'binary';
}

/**
 * DynamoDB Global Secondary Index configuration
 */
export interface GlobalSecondaryIndexConfig {
    indexName: string;
    partitionKey: AttributeConfig;
    sortKey?: AttributeConfig;
    projectionType?: 'all' | 'keys_only' | 'include';
    nonKeyAttributes?: string[];
    readCapacity?: number;
    writeCapacity?: number;
}

/**
 * DynamoDB Local Secondary Index configuration
 */
export interface LocalSecondaryIndexConfig {
    indexName: string;
    sortKey: AttributeConfig;
    projectionType?: 'all' | 'keys_only' | 'include';
    nonKeyAttributes?: string[];
}

/**
 * Point-in-time recovery configuration
 */
export interface PointInTimeRecoveryConfig {
    enabled?: boolean;
    recoveryPeriodInDays?: number;
}

/**
 * Comprehensive DynamoDB table configuration
 * Only 'name' is required; all other options have sensible defaults
 */
export interface TableConfig {
    // Required
    name: string;

    // Schema - defaults provided if not specified
    partitionKey?: AttributeConfig;
    sortKey?: AttributeConfig;

    // Billing and capacity
    billingMode?: 'provisioned' | 'pay_per_request';
    readCapacity?: number;
    writeCapacity?: number;
    maxReadRequestUnits?: number;
    maxWriteRequestUnits?: number;

    // Backup and recovery
    pointInTimeRecovery?: boolean | PointInTimeRecoveryConfig;
    deletionProtection?: boolean;

    // Encryption
    encryption?: 'default' | 'aws_managed' | 'customer_managed';
    encryptionKeyArn?: string;

    // TTL
    timeToLiveAttribute?: string;

    // Streams
    stream?: 'new_image' | 'old_image' | 'new_and_old_images' | 'keys_only';

    // Table class
    tableClass?: 'standard' | 'standard_infrequent_access';

    // Indexes
    globalSecondaryIndexes?: GlobalSecondaryIndexConfig[];
    localSecondaryIndexes?: LocalSecondaryIndexConfig[];

    // Contributor insights
    contributorInsights?: boolean;

    // Tags
    tags?: Record<string, string>;

    // Removal policy override (if different from global config)
    removalPolicy?: 'destroy' | 'retain';
}

export interface DynamoDBConfig {
    namePrefix?: string;
    tables: TableConfig[];
}

export interface OidcConfig {
    issuer: string;
    clientId: string;
    redirectPath?: string;
}

export interface IngressConfig {
    enabled?: boolean;
    domain?: string;
    hostedZone?: string;
    zoneName?: string;
}

/**
 * Valid namespace values (short owner identifiers)
 */
export type NamespaceTag = 'lb' | 'tmiq' | 'ps' | 'oc' | 'shared' | 'plat' | 'sec';

/**
 * Valid environment/region values
 */
export type EnvironmentTag = 'ue1' | 'uw2' | 'knx' | 'atl';

/**
 * Valid stage values (deployment stage)
 */
export type StageTag = 'dev' | 'qa' | 'stg' | 'sb' | 'prod';

/**
 * Resource tagging configuration for FinOps, lifecycle management, and ownership
 */
export interface ResourceTagsConfig {
    // Short version of owner (required)
    namespace: NamespaceTag;

    // Region/location code (can be auto-derived from region if not set)
    environment?: EnvironmentTag;

    // Deployment stage (can be auto-derived from environment if not set)
    stage?: StageTag;

    // List of defining attributes (varies by resource, e.g., 'webserver', 'api')
    attributes?: string[];

    // Name tag value - should be consistent across all resources (optional, defaults to appName if not set)
    name?: string;
}

/**
 * Complete application configuration
 */
export interface AppConfig {
    // Application name (used in resource naming)
    appName: string;

    // CloudFormation stack name (optional, defaults to appName + 'Stack')
    stackName?: string;

    // AWS Secrets Manager secret name (optional, auto-computed if not provided)
    secretName?: string;

    // Environment name (dev, qa, prod, etc.)
    environment: string;

    // AWS account and region
    account: string;
    region: string;

    // DynamoDB configuration (optional)
    dynamodb?: DynamoDBConfig;

    // Lambda functions (at least one required)
    lambdas: LambdaFunctionConfig[];

    // Deployment type
    deploymentType: 'lambda-function-url' | 'api-gateway';

    // OIDC configuration (optional)
    oidc?: OidcConfig;

    // Custom domain configuration (optional, only for API Gateway)
    ingress?: IngressConfig;

    // CloudWatch Logs retention (days)
    logRetentionDays?: number;

    // Removal policies for resources
    removalPolicy?: RemovalPolicyConfig | 'destroy' | 'retain';

    // Additional environment variables to inject into all Lambdas
    globalEnvironment?: Record<string, string>;

    // Tags to apply to all resources
    globalTags?: Record<string, string>;

    // Resource tagging configuration for FinOps, lifecycle, and ownership
    tags?: ResourceTagsConfig;
}

