/**
 * Helper functions to convert configuration strings to CDK enums
 */

import { RemovalPolicyConfig, PointInTimeRecoveryConfig } from './types';

/**
 * Helper function to convert architecture string to CDK Architecture enum
 */
export function getLambdaArchitecture(architecture?: string): any {
    const lambda = require('aws-cdk-lib/aws-lambda');
    const architectureMap: Record<string, any> = {
        'arm64': lambda.Architecture.ARM_64,
        'x86_64': lambda.Architecture.X86_64,
    };
    return architectureMap[architecture || 'arm64'] || lambda.Architecture.ARM_64;
}

/**
 * Helper function to get removal policy for a specific resource type
 */
export function getRemovalPolicy(
    removalPolicy: RemovalPolicyConfig | 'destroy' | 'retain' | undefined,
    resourceType: 'table' | 'secrets' | 'logGroup' | 'lambdaLayer'
): any {
    const cdk = require('aws-cdk-lib');

    // If no removal policy is set, default to 'retain'
    if (!removalPolicy) {
        return cdk.RemovalPolicy.RETAIN;
    }

    // If it's a string, use that for all resources
    if (typeof removalPolicy === 'string') {
        return removalPolicy === 'retain' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
    }

    // If it's an object, get the specific resource policy
    const policy = removalPolicy[resourceType];
    return policy === 'retain' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;
}

/**
 * Helper function to convert attribute type string to CDK AttributeType
 */
export function getAttributeType(type: 'string' | 'number' | 'binary'): any {
    const dynamodb = require('aws-cdk-lib/aws-dynamodb');
    const typeMap: Record<string, any> = {
        'string': dynamodb.AttributeType.STRING,
        'number': dynamodb.AttributeType.NUMBER,
        'binary': dynamodb.AttributeType.BINARY,
    };
    return typeMap[type] || dynamodb.AttributeType.STRING;
}

/**
 * Helper function to convert billing mode string to CDK BillingMode
 */
export function getBillingMode(mode?: 'provisioned' | 'pay_per_request'): any {
    const dynamodb = require('aws-cdk-lib/aws-dynamodb');
    return mode === 'provisioned'
        ? dynamodb.BillingMode.PROVISIONED
        : dynamodb.BillingMode.PAY_PER_REQUEST;
}

/**
 * Helper function to convert encryption string to CDK TableEncryption
 */
export function getTableEncryption(encryption?: 'default' | 'aws_managed' | 'customer_managed'): any {
    const dynamodb = require('aws-cdk-lib/aws-dynamodb');
    const encryptionMap: Record<string, any> = {
        'default': dynamodb.TableEncryption.DEFAULT,
        'aws_managed': dynamodb.TableEncryption.AWS_MANAGED,
        'customer_managed': dynamodb.TableEncryption.CUSTOMER_MANAGED,
    };
    return encryptionMap[encryption || 'default'] || dynamodb.TableEncryption.DEFAULT;
}

/**
 * Helper function to convert stream type string to CDK StreamViewType
 */
export function getStreamViewType(stream?: 'new_image' | 'old_image' | 'new_and_old_images' | 'keys_only'): any {
    const dynamodb = require('aws-cdk-lib/aws-dynamodb');
    const streamMap: Record<string, any> = {
        'new_image': dynamodb.StreamViewType.NEW_IMAGE,
        'old_image': dynamodb.StreamViewType.OLD_IMAGE,
        'new_and_old_images': dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
        'keys_only': dynamodb.StreamViewType.KEYS_ONLY,
    };
    return streamMap[stream || ''];
}

/**
 * Helper function to convert table class string to CDK TableClass
 */
export function getTableClass(tableClass?: 'standard' | 'standard_infrequent_access'): any {
    const dynamodb = require('aws-cdk-lib/aws-dynamodb');
    return tableClass === 'standard_infrequent_access'
        ? dynamodb.TableClass.STANDARD_INFREQUENT_ACCESS
        : dynamodb.TableClass.STANDARD;
}

/**
 * Helper function to convert projection type string to CDK ProjectionType
 */
export function getProjectionType(projectionType?: 'all' | 'keys_only' | 'include'): any {
    const dynamodb = require('aws-cdk-lib/aws-dynamodb');
    const projectionMap: Record<string, any> = {
        'all': dynamodb.ProjectionType.ALL,
        'keys_only': dynamodb.ProjectionType.KEYS_ONLY,
        'include': dynamodb.ProjectionType.INCLUDE,
    };
    return projectionMap[projectionType || 'all'] || dynamodb.ProjectionType.ALL;
}

/**
 * Helper function to build point-in-time recovery specification
 */
export function getPointInTimeRecoverySpec(pitr?: boolean | PointInTimeRecoveryConfig): any {
    if (pitr === false || pitr === undefined) {
        return { pointInTimeRecoveryEnabled: false };
    }

    if (pitr === true) {
        return { pointInTimeRecoveryEnabled: true };
    }

    // It's a PointInTimeRecoveryConfig object
    const spec: any = {
        pointInTimeRecoveryEnabled: pitr.enabled ?? true,
    };

    if (pitr.recoveryPeriodInDays !== undefined) {
        spec.recoveryPeriodInDays = pitr.recoveryPeriodInDays;
    }

    return spec;
}

