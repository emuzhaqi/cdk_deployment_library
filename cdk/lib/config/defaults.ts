/**
 * Default values and configuration application logic
 */

import { TableConfig, RemovalPolicyConfig, LambdaFunctionConfig, AppConfig, NewRelicLambdaConfig } from './types';
import { deriveEnvironmentTag, validateAndNormalizeTags, generateNameTag } from './tags';

/**
 * Apply sensible defaults to table configuration
 */
export function applyTableDefaults(table: TableConfig, namePrefix: string): void {
    // Apply name prefix if table name doesn't already include it
    if (!table.name.startsWith(namePrefix)) {
        table.name = `${namePrefix}${table.name}`;
    }

    // Default partition key if not specified (common pattern for generic tables)
    if (!table.partitionKey) {
        table.partitionKey = { name: 'id', type: 'string' };
    }

    // Default billing mode
    table.billingMode = table.billingMode ?? 'pay_per_request';

    // Set read/write capacity defaults only if billing mode is provisioned
    if (table.billingMode === 'provisioned') {
        table.readCapacity = table.readCapacity ?? 5;
        table.writeCapacity = table.writeCapacity ?? 5;
    }

    // Point-in-time recovery defaults
    if (table.pointInTimeRecovery === undefined) {
        table.pointInTimeRecovery = false;
    }

    // Deletion protection default
    table.deletionProtection = table.deletionProtection ?? false;

    // Encryption default
    table.encryption = table.encryption ?? 'default';

    // Table class default
    table.tableClass = table.tableClass ?? 'standard';

    // Contributor insights default
    table.contributorInsights = table.contributorInsights ?? false;

    // Initialize empty arrays for indexes if not provided
    table.globalSecondaryIndexes = table.globalSecondaryIndexes ?? [];
    table.localSecondaryIndexes = table.localSecondaryIndexes ?? [];

    // Initialize empty tags object if not provided
    table.tags = table.tags ?? {};
}

/**
 * Apply sensible defaults to Lambda function configuration
 */
export function applyLambdaDefaults(lambda: LambdaFunctionConfig): void {
    // Default runtime
    lambda.runtime = lambda.runtime ?? 'python3.13';

    // Default architecture
    lambda.architecture = lambda.architecture ?? 'arm64';

    // Default memory
    lambda.memory = lambda.memory ?? 512;

    // Default timeout (in minutes, converted to seconds later)
    lambda.timeout = lambda.timeout ?? 0.5;

    // Default table access
    lambda.tableAccess = lambda.tableAccess ?? ['*'];

    // Default routes for API Gateway
    if (!lambda.routes) {
        lambda.routes = [{ path: '/{proxy+}', methods: ['ANY'] }];
    }

    // Default bundle dependencies for Python
    lambda.bundleDependencies = lambda.bundleDependencies ?? true;

    // Default exclude patterns
    lambda.exclude = lambda.exclude ?? [];

    // Default needsSecrets
    lambda.needsSecrets = lambda.needsSecrets ?? false;

    // Default environment
    lambda.environment = lambda.environment ?? {};

    // Default layers
    lambda.layers = lambda.layers ?? [];

    // Apply defaults to layers
    if (lambda.layers && lambda.layers.length > 0) {
        lambda.layers.forEach((layer, idx) => {
            layer.description = layer.description ?? `Layer ${idx} for ${lambda.id}`;
        });
    }

    // Default custom policies
    lambda.customPolicies = lambda.customPolicies ?? [];

    // Default description
    lambda.description = lambda.description ?? `${lambda.id} Lambda function`;
}

const NEW_RELIC_ACCOUNT_ID = '451483290750';
const NEW_RELIC_LAYER_VERSION = 2;

// Supported runtimes with their New Relic layer base names
const NEW_RELIC_LAYER_NAMES: Record<string, string> = {
  'python3.13': 'NewRelicPython313',
  'python3.12': 'NewRelicPython312',
  'nodejs20.x': 'NewRelicNodeJS20',
  'nodejs18.x': 'NewRelicNodeJS18',
  // Add more as needed
};

// Supported architectures and suffix mapping
const ARCH_SUFFIX: Record<'arm64' | 'x86_64', string> = {
  arm64: 'ARM64',
  x86_64: 'X86',
};

// ARN builder
function buildNewRelicLayerArn(region: string, layerName: string, arch: 'arm64' | 'x86_64'): string {
  const archSuffix = ARCH_SUFFIX[arch];
  return `arn:aws:lambda:${region}:${NEW_RELIC_ACCOUNT_ID}:layer:${layerName}${archSuffix}:${NEW_RELIC_LAYER_VERSION}`;
}

// Master lookup
function getNewRelicLayerArn(runtime: string, arch: 'arm64' | 'x86_64', region: string): string {
  const baseName = NEW_RELIC_LAYER_NAMES[runtime];
  if (!baseName) {
    throw new Error(`Unsupported runtime for New Relic layer: ${runtime}`);
  }

  return buildNewRelicLayerArn(region, baseName, arch);
}

/**
 * Apply sensible defaults to New Relic Lambda configuration
 */
export function applyNewRelicLambdaDefaults(newRelicLambda: NewRelicLambdaConfig, lambda: LambdaFunctionConfig, region: string): void {
    // Default enabled (Extension layer) to true if not specified
    newRelicLambda.enabled = newRelicLambda.enabled ?? true;

    // Default log enabled to true if not specified
    newRelicLambda.logEnabled = newRelicLambda.logEnabled ?? true;

    // Default sendFunctionLogs to false if not specified
    newRelicLambda.sendFunctionLogs = newRelicLambda.sendFunctionLogs ?? false;

    // Default logLevel to INFO if not specified
    newRelicLambda.logLevel = newRelicLambda.logLevel ?? 'INFO';

    // Compute layer ARN based on Lambda runtime and architecture if not provided
    if (!newRelicLambda.layerArn) {
      const runtime = lambda.runtime ?? 'python3.13';
      const arch = lambda.architecture ?? 'arm64';
      (newRelicLambda as any).layerArn = getNewRelicLayerArn(runtime, arch, region);
    }
}

/**
 * Global configuration defaults
 */
export interface GlobalDefaults {
    logRetentionDays: number;
    oidcRedirectPath: string;
    corsMaxAge: number; // in hours
}

export const GLOBAL_DEFAULTS: GlobalDefaults = {
    logRetentionDays: 7,
    oidcRedirectPath: '/auth/callback',
    corsMaxAge: 1,
};

/**
 * Normalize removal policy configuration
 * Converts string format to object format for consistency
 */
export function normalizeRemovalPolicy(
    policy: RemovalPolicyConfig | 'destroy' | 'retain' | undefined
): RemovalPolicyConfig {
    if (!policy) {
        return {
            table: 'retain',
            secrets: 'retain',
            logGroup: 'retain',
            lambdaLayer: 'retain',
        };
    }

    if (typeof policy === 'string') {
        return {
            table: policy,
            secrets: policy,
            logGroup: policy,
            lambdaLayer: policy,
        };
    }

    return policy;
}

/**
 * Apply global defaults to application configuration
 * Includes computing the secret name if not provided
 */
export function applyGlobalDefaults(config: AppConfig): void {
    // Compute and set stack name if not provided
    if (!config.stackName) {
        config.stackName = `${config.appName}Stack`;
    }

    // Generate secret name if not provided and any Lambda needs secrets
    const needsSecrets = config.lambdas.some(l => l.needsSecrets);
    if (needsSecrets && !config.secretName) {
        // Generate secret name using standard naming convention
        if (config.tags) {
            // Tag-based naming: namespace-environment-stage-appNamesecrets
            const normalizedTags = validateAndNormalizeTags(
                config.tags,
                config.region,
                config.environment,
                config.appName
            );
            const baseNameTag = generateNameTag(normalizedTags);
            config.secretName = `${baseNameTag}-${config.stackName}-${config.appName}-secrets`;
        } else {
            // Basic naming shortRegion-env-appNamesecrets
            const shortRegion = deriveEnvironmentTag(config.region);
            config.secretName = `${shortRegion}-${config.environment}-${config.stackName}-${config.appName}-secrets`;
        }
    }

    // Apply New Relic Lambda defaults for each Lambda after Lambda defaults are applied
    config.lambdas.forEach(lambda => {
        if (!lambda.newRelic) {
            lambda.newRelic = {};
        }
        applyNewRelicLambdaDefaults(lambda.newRelic, lambda, config.region);
    });
}

