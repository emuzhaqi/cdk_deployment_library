/**
 * Configuration loading and validation
 */

import { AppConfig } from './types';
import { applyTableDefaults, applyLambdaDefaults, applyGlobalDefaults, normalizeRemovalPolicy, GLOBAL_DEFAULTS } from './defaults';
import { deriveEnvironmentTag, validateAndNormalizeTags, generateNameTag } from './tags';

/**
 * Load and validate configuration for a given environment
 */
export function loadConfig(envName: string): AppConfig {
    const fs = require('fs');
    const path = require('path');

    const configPath = path.join(__dirname, '..', '..', 'config', `${envName}.json`);

    if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
    }

    const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Validate required top-level fields
    validateRequiredFields(config, configPath);

    // Validate and apply defaults to DynamoDB configuration
    if (config.dynamodb) {
        validateDynamoDBConfig(config, configPath);
    }

    // Validate OIDC configuration
    if (config.oidc) {
        validateOidcConfig(config, configPath);
    }

    // Validate ingress configuration if enabled
    if (config.ingress) {
        validateIngressConfig(config, configPath);
    }

    // Validate Lambda configuration
    validateLambdasConfig(config, configPath);

    // Validate secrets configuration
    validateSecretsConfig(config, configPath);

    // Validate secret name format if provided
    validateSecretNameFormat(config, configPath);

    // Apply defaults to Lambda configuration
    config.lambdas.forEach((lambda) => {
        applyLambdaDefaults(lambda);
    });

    // Apply global defaults (including secretName computation)
    applyGlobalDefaults(config);

    // Apply global defaults
    config.logRetentionDays = config.logRetentionDays ?? GLOBAL_DEFAULTS.logRetentionDays;

    // Apply OIDC defaults if OIDC is configured
    if (config.oidc) {
        config.oidc.redirectPath = config.oidc.redirectPath ?? GLOBAL_DEFAULTS.oidcRedirectPath;
    }

    // Normalize removal policy
    config.removalPolicy = normalizeRemovalPolicy(config.removalPolicy);

    return config;
}

/**
 * Validate required top-level fields
 */
function validateRequiredFields(config: AppConfig, configPath: string): void {
    const requiredFields = [
        'appName',
        'environment',
        'account',
        'region',
        'lambdas',
        'deploymentType'
    ];

    for (const field of requiredFields) {
        if (!(field in config)) {
            throw new Error(`Missing required field '${field}' in ${configPath}`);
        }
    }
}

/**
 * Validate DynamoDB configuration
 */
function validateDynamoDBConfig(config: AppConfig, configPath: string): void {
    if (!config.dynamodb) return;

    if (!config.dynamodb.namePrefix) {
        throw new Error(`Missing required field 'dynamodb.namePrefix' in ${configPath}`);
    }

    if (!config.dynamodb.tables || !Array.isArray(config.dynamodb.tables) || config.dynamodb.tables.length === 0) {
        throw new Error(`Missing or empty 'dynamodb.tables' array in ${configPath}`);
    }

    // Validate each table configuration
    config.dynamodb.tables.forEach((table, index) => {
        if (!table.name) {
            throw new Error(`Missing required field 'name' for table at index ${index} in ${configPath}`);
        }

        // Apply defaults to table configuration
        applyTableDefaults(table, config.dynamodb!.namePrefix || '');
    });
}

/**
 * Validate OIDC configuration
 */
function validateOidcConfig(config: AppConfig, configPath: string): void {
    if (!config.oidc) return;

    if (!config.oidc.issuer) {
        throw new Error(`Missing required field 'oidc.issuer' in ${configPath}`);
    }
    if (!config.oidc.clientId) {
        throw new Error(`Missing required field 'oidc.clientId' in ${configPath}`);
    }
}

/**
 * Validate ingress configuration if enabled
 */
function validateIngressConfig(config: AppConfig, configPath: string): void {
    if (!config.ingress) return;

    if (config.ingress.enabled) {
        if (!config.ingress.domain) {
            throw new Error(`Missing required field 'ingress.domain' when 'ingress.enabled' is true in ${configPath}`);
        }
        if (!config.ingress.hostedZone) {
            throw new Error(`Missing required field 'ingress.hostedZone' when 'ingress.enabled' is true in ${configPath}`);
        }
        if (!config.ingress.zoneName) {
            throw new Error(`Missing required field 'ingress.zoneName' when 'ingress.enabled' is true in ${configPath}`);
        }
    }
}

/**
 * Validate Lambda configuration
 */
function validateLambdasConfig(config: AppConfig, configPath: string): void {
    if (!config.lambdas || !Array.isArray(config.lambdas) || config.lambdas.length === 0) {
        throw new Error(`Missing or empty 'lambdas' array in ${configPath}`);
    }

    // Validate each Lambda configuration
    config.lambdas.forEach((lambda, index) => {
        if (!lambda.id) {
            throw new Error(`Missing required field 'id' for Lambda at index ${index} in ${configPath}`);
        }
        if (!lambda.handler) {
            throw new Error(`Missing required field 'handler' for Lambda at index ${index} in ${configPath}`);
        }
        if (!lambda.codePath) {
            throw new Error(`Missing required field 'codePath' for Lambda at index ${index} in ${configPath}`);
        }
    });
}

/**
 * Validate secrets configuration
 * Ensures no duplicate secret keys across all Lambdas
 */
function validateSecretsConfig(config: AppConfig, configPath: string): void {
    const secretKeys = new Set<string>();
    const duplicates: string[] = [];

    config.lambdas.forEach((lambda, lambdaIndex) => {
        if (lambda.secretsConfig) {
            lambda.secretsConfig.fields.forEach((field, fieldIndex) => {
                if (secretKeys.has(field.key)) {
                    duplicates.push(field.key);
                } else {
                    secretKeys.add(field.key);
                }

                // Validate that key and description are provided
                if (!field.key) {
                    throw new Error(`Missing 'key' for secret field at Lambda index ${lambdaIndex}, field index ${fieldIndex} in ${configPath}`);
                }
                if (!field.description) {
                    throw new Error(`Missing 'description' for secret field '${field.key}' at Lambda index ${lambdaIndex} in ${configPath}`);
                }
            });
        }

        // Validate that if needsSecrets is true, secretsConfig is provided
        if (lambda.needsSecrets && !lambda.secretsConfig) {
            throw new Error(`Lambda '${lambda.id}' has needsSecrets=true but no secretsConfig defined in ${configPath}`);
        }
    });

    if (duplicates.length > 0) {
        throw new Error(`Duplicate secret keys detected in ${configPath}: ${duplicates.join(', ')}`);
    }
}

/**
 * Validate that a secret name follows the naming convention if provided
 * @throws Error if the secret name doesn't match the expected pattern
 */
function validateSecretNameFormat(config: AppConfig, configPath: string): void {
    // Only validate if secretName is explicitly provided
    if (!config.secretName) {
        return;
    }

    const shortRegion = deriveEnvironmentTag(config.region);
    
    let expectedPattern: string;
    if (config.tags) {
        const normalizedTags = validateAndNormalizeTags(
            config.tags,
            config.region,
            config.environment,
            config.appName
        );
        const baseNameTag = generateNameTag(normalizedTags);
        expectedPattern = `${baseNameTag}-${config.appName}-secrets`;
    } else {
        expectedPattern = `${config.appName}-${shortRegion}-${config.environment}-secrets`;
    }
    
    if (config.secretName !== expectedPattern) {
        throw new Error(
            `Invalid secretName in ${configPath}: "${config.secretName}". ` +
            `Expected format: "${expectedPattern}". ` +
            `Either use the standard naming convention or omit secretName to auto-generate.`
        );
    }
}

