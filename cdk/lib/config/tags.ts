/**
 * Tag validation and generation utilities for resource tagging
 */

import { ResourceTagsConfig, NamespaceTag, EnvironmentTag, StageTag } from './types';

/**
 * AWS region to environment tag mapping
 */
const REGION_TO_ENV_TAG: Record<string, EnvironmentTag> = {
    'us-east-1': 'ue1',
    'us-west-2': 'uw2',
    // Add more mappings as needed
};

/**
 * Environment string to stage tag mapping
 */
const ENV_TO_STAGE_TAG: Record<string, StageTag> = {
    'dev': 'dev',
    'development': 'dev',
    'qa': 'qa',
    'test': 'qa',
    'stg': 'stg',
    'staging': 'stg',
    'sb': 'sb',
    'sandbox': 'sb',
    'prod': 'prod',
    'production': 'prod',
};

/**
 * Valid namespace values
 */
const VALID_NAMESPACES: NamespaceTag[] = ['lb', 'tmiq', 'ps', 'oc', 'shared', 'plat', 'sec'];

/**
 * Valid environment tag values
 */
const VALID_ENVIRONMENTS: EnvironmentTag[] = ['ue1', 'uw2', 'knx', 'atl'];

/**
 * Valid stage values
 */
const VALID_STAGES: StageTag[] = ['dev', 'qa', 'stg', 'sb', 'prod'];

/**
 * Validate namespace tag value
 */
export function validateNamespace(namespace: string): namespace is NamespaceTag {
    return VALID_NAMESPACES.includes(namespace as NamespaceTag);
}

/**
 * Validate environment tag value
 */
export function validateEnvironmentTag(environment: string): environment is EnvironmentTag {
    return VALID_ENVIRONMENTS.includes(environment as EnvironmentTag);
}

/**
 * Validate stage tag value
 */
export function validateStageTag(stage: string): stage is StageTag {
    return VALID_STAGES.includes(stage as StageTag);
}

/**
 * Derive environment tag from AWS region
 */
export function deriveEnvironmentTag(region: string): EnvironmentTag {
    const envTag = REGION_TO_ENV_TAG[region];
    if (!envTag) {
        throw new Error(
            `Cannot derive environment tag from region "${region}". ` +
            `Supported regions: ${Object.keys(REGION_TO_ENV_TAG).join(', ')}. ` +
            `Please set tags.environment explicitly in your config.`
        );
    }
    return envTag;
}

/**
 * Derive stage tag from environment string
 */
export function deriveStageTag(environment: string): StageTag {
    const normalizedEnv = environment.toLowerCase();
    const stageTag = ENV_TO_STAGE_TAG[normalizedEnv];
    if (!stageTag) {
        throw new Error(
            `Cannot derive stage tag from environment "${environment}". ` +
            `Supported environments: ${Object.keys(ENV_TO_STAGE_TAG).join(', ')}. ` +
            `Please set tags.stage explicitly in your config.`
        );
    }
    return stageTag;
}

/**
 * Validate and normalize tags configuration
 * Throws errors if validation fails
 */
export function validateAndNormalizeTags(
    tagsConfig: ResourceTagsConfig,
    awsRegion: string,
    environmentName: string,
    appName: string
): Required<ResourceTagsConfig> {
    // Validate namespace
    if (!validateNamespace(tagsConfig.namespace)) {
        throw new Error(
            `Invalid namespace "${tagsConfig.namespace}". ` +
            `Valid values: ${VALID_NAMESPACES.join(', ')}`
        );
    }

    // Derive or validate environment tag
    let environmentTag: EnvironmentTag;
    if (tagsConfig.environment) {
        if (!validateEnvironmentTag(tagsConfig.environment)) {
            throw new Error(
                `Invalid environment tag "${tagsConfig.environment}". ` +
                `Valid values: ${VALID_ENVIRONMENTS.join(', ')}`
            );
        }
        environmentTag = tagsConfig.environment;
    } else {
        environmentTag = deriveEnvironmentTag(awsRegion);
    }

    // Derive or validate stage tag
    let stageTag: StageTag;
    if (tagsConfig.stage) {
        if (!validateStageTag(tagsConfig.stage)) {
            throw new Error(
                `Invalid stage tag "${tagsConfig.stage}". ` +
                `Valid values: ${VALID_STAGES.join(', ')}`
            );
        }
        stageTag = tagsConfig.stage;
    } else {
        stageTag = deriveStageTag(environmentName);
    }

    // Validate attributes (basic check - must be non-empty strings)
    const attributes = tagsConfig.attributes || [];
    attributes.forEach((attr, idx) => {
        if (!attr || typeof attr !== 'string' || attr.trim() === '') {
            throw new Error(
                `Invalid attribute at index ${idx}: "${attr}". ` +
                `Attributes must be non-empty strings.`
            );
        }
    });

    // Use provided name or default to appName
    const name = tagsConfig.name || appName;

    return {
        namespace: tagsConfig.namespace,
        environment: environmentTag,
        stage: stageTag,
        attributes: attributes,
        name: name,
    };
}

/**
 * Generate the name tag from namespace, environment, stage, and attributes
 * Format: namespace-environment-stage[-attribute1][-attribute2]...
 */
export function generateNameTag(tags: Required<ResourceTagsConfig>): string {
    const parts = [
        tags.namespace,
        tags.environment,
        tags.stage,
        ...tags.attributes,
    ];
    return parts.filter(Boolean).join('-');
}

/**
 * Convert tags configuration to AWS CDK tags object
 * Note: AWS tags support alphanumeric, spaces, and +-=._:/@
 * Commas are NOT allowed, so we use colons as separators
 */
export function toAwsTags(tags: Required<ResourceTagsConfig>): Record<string, string> {
    return {
        Namespace: tags.namespace,
        Environment: tags.environment,
        Stage: tags.stage,
        Attributes: tags.attributes.join(':'),
        Name: tags.name,
    };
}

/**
 * Get tags with resource-specific attributes
 * Useful for adding resource-specific attributes to a base tags config
 * Note: The Name tag remains the same; only the Attributes tag gets updated
 */
export function getResourceTags(
    baseTags: Required<ResourceTagsConfig>,
    resourceAttributes: string[]
): Record<string, string> {
    const resourceTagConfig: Required<ResourceTagsConfig> = {
        ...baseTags,
        attributes: [...baseTags.attributes, ...resourceAttributes],
    };

    // Convert to AWS tags, which will use the same name but updated attributes
    return toAwsTags(resourceTagConfig);
}

