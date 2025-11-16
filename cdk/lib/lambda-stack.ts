import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as kms from 'aws-cdk-lib/aws-kms';
import {
    AppConfig,
    LambdaFunctionConfig,
    TableConfig,
    GlobalSecondaryIndexConfig,
    LocalSecondaryIndexConfig,
    ResourceTagsConfig,
} from './config/types';
import {
    getLambdaArchitecture,
    getRemovalPolicy,
    getAttributeType,
    getBillingMode,
    getTableEncryption,
    getStreamViewType,
    getTableClass,
    getProjectionType,
    getPointInTimeRecoverySpec,
    validateAndNormalizeTags,
    toAwsTags,
    getResourceTags,
    deriveEnvironmentTag,
    generateNameTag,
} from './config';
import { GLOBAL_DEFAULTS } from './config/defaults';

export interface LambdaStackProps extends cdk.StackProps {
    config: AppConfig;
}

/**
 * Helper to parse runtime string to Lambda Runtime object
 */
function getLambdaRuntime(runtimeStr: string): lambda.Runtime {
    const runtimeMap: Record<string, lambda.Runtime> = {
        'python3.13': lambda.Runtime.PYTHON_3_13,
        'python3.12': lambda.Runtime.PYTHON_3_12,
        'python3.11': lambda.Runtime.PYTHON_3_11,
        'python3.10': lambda.Runtime.PYTHON_3_10,
        'python3.9': lambda.Runtime.PYTHON_3_9,
        'nodejs20.x': lambda.Runtime.NODEJS_20_X,
        'nodejs18.x': lambda.Runtime.NODEJS_18_X,
        'java21': lambda.Runtime.JAVA_21,
        'java17': lambda.Runtime.JAVA_17,
        'java11': lambda.Runtime.JAVA_11,
        'dotnet8': lambda.Runtime.DOTNET_8,
        'dotnet6': lambda.Runtime.DOTNET_6,
        'ruby3.2': lambda.Runtime.RUBY_3_2,
        'ruby3.3': lambda.Runtime.RUBY_3_3,
    };

    if (!runtimeMap[runtimeStr]) {
        throw new Error(`Unsupported Lambda runtime: ${runtimeStr}`);
    }

    return runtimeMap[runtimeStr];
}

/**
 * Helper to parse HTTP method string to API Gateway HttpMethod
 */
function getHttpMethod(methodStr: string): apigwv2.HttpMethod {
    const methodMap: Record<string, apigwv2.HttpMethod> = {
        'GET': apigwv2.HttpMethod.GET,
        'POST': apigwv2.HttpMethod.POST,
        'PUT': apigwv2.HttpMethod.PUT,
        'DELETE': apigwv2.HttpMethod.DELETE,
        'PATCH': apigwv2.HttpMethod.PATCH,
        'HEAD': apigwv2.HttpMethod.HEAD,
        'OPTIONS': apigwv2.HttpMethod.OPTIONS,
        'ANY': apigwv2.HttpMethod.ANY,
    };

    const method = methodMap[methodStr.toUpperCase()];
    if (!method) {
        throw new Error(`Unsupported HTTP method: ${methodStr}`);
    }

    return method;
}

/**
 * Generate a standardized resource name based on config and tags
 * If tags are present in config, uses tag-based naming (namespace-environment-stage-resourceName)
 * Otherwise, falls back to basic naming (shortRegion-env-resourceName)
 */
export function generateResourceName(
    config: AppConfig,
    resourceName: string,
    stackName: string,
    normalizedTags?: Required<ResourceTagsConfig>
): string {
    if (normalizedTags) {
        const baseNameTag = generateNameTag(normalizedTags);
        return `${baseNameTag}-${stackName}-${resourceName}`;
    } else {
        const shortRegion = deriveEnvironmentTag(config.region);
        return `${shortRegion}-${config.environment}-${stackName}-${resourceName}`;
    }
}

/**
 * Helper function to create a DynamoDB table from configuration
 */
function createTable(
    scope: Construct,
    id: string,
    tableName: string,
    tableConfig: TableConfig,
    globalRemovalPolicy: any,
    resourceTags?: Required<ResourceTagsConfig>
): dynamodb.Table {

    // Build table properties
    const tableProps: any = {
        tableName: tableName,
        partitionKey: {
            name: tableConfig.partitionKey!.name,
            type: getAttributeType(tableConfig.partitionKey!.type),
        },
        billingMode: getBillingMode(tableConfig.billingMode),
        pointInTimeRecoverySpecification: getPointInTimeRecoverySpec(tableConfig.pointInTimeRecovery),
        deletionProtection: tableConfig.deletionProtection,
        tableClass: getTableClass(tableConfig.tableClass),
        contributorInsightsSpecification: {
            enabled: tableConfig.contributorInsights,
        },
        removalPolicy: tableConfig.removalPolicy
            ? (tableConfig.removalPolicy === 'retain' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY)
            : globalRemovalPolicy,
    };

    // Add sort key if specified
    if (tableConfig.sortKey) {
        tableProps.sortKey = {
            name: tableConfig.sortKey.name,
            type: getAttributeType(tableConfig.sortKey.type),
        };
    }

    // Add read/write capacity for provisioned billing
    if (tableConfig.billingMode === 'provisioned') {
        tableProps.readCapacity = tableConfig.readCapacity;
        tableProps.writeCapacity = tableConfig.writeCapacity;
    }

    // Add max on-demand throughput if specified
    if (tableConfig.maxReadRequestUnits) {
        tableProps.maxReadRequestUnits = tableConfig.maxReadRequestUnits;
    }
    if (tableConfig.maxWriteRequestUnits) {
        tableProps.maxWriteRequestUnits = tableConfig.maxWriteRequestUnits;
    }

    // Add encryption
    tableProps.encryption = getTableEncryption(tableConfig.encryption);

    // Add encryption key if specified
    if (tableConfig.encryptionKeyArn && tableConfig.encryption === 'customer_managed') {
        tableProps.encryptionKey = kms.Key.fromKeyArn(scope, `${id}Key`, tableConfig.encryptionKeyArn);
    }

    // Add TTL attribute if specified
    if (tableConfig.timeToLiveAttribute) {
        tableProps.timeToLiveAttribute = tableConfig.timeToLiveAttribute;
    }

    // Add stream if specified
    if (tableConfig.stream) {
        tableProps.stream = getStreamViewType(tableConfig.stream);
    }

    // Create the table
    const table = new dynamodb.Table(scope, id, tableProps);

    // Add Global Secondary Indexes
    if (tableConfig.globalSecondaryIndexes && tableConfig.globalSecondaryIndexes.length > 0) {
        tableConfig.globalSecondaryIndexes.forEach((gsi: GlobalSecondaryIndexConfig) => {
            const gsiProps: any = {
                indexName: gsi.indexName,
                partitionKey: {
                    name: gsi.partitionKey.name,
                    type: getAttributeType(gsi.partitionKey.type),
                },
                projectionType: getProjectionType(gsi.projectionType),
            };

            // Add sort key if specified
            if (gsi.sortKey) {
                gsiProps.sortKey = {
                    name: gsi.sortKey.name,
                    type: getAttributeType(gsi.sortKey.type),
                };
            }

            // Add non-key attributes if using INCLUDE projection
            if (gsi.projectionType === 'include' && gsi.nonKeyAttributes) {
                gsiProps.nonKeyAttributes = gsi.nonKeyAttributes;
            }

            // Add read/write capacity for provisioned billing
            if (tableConfig.billingMode === 'provisioned') {
                gsiProps.readCapacity = gsi.readCapacity;
                gsiProps.writeCapacity = gsi.writeCapacity;
            }

            table.addGlobalSecondaryIndex(gsiProps);
        });
    }

    // Add Local Secondary Indexes
    if (tableConfig.localSecondaryIndexes && tableConfig.localSecondaryIndexes.length > 0) {
        tableConfig.localSecondaryIndexes.forEach((lsi: LocalSecondaryIndexConfig) => {
            const lsiProps: any = {
                indexName: lsi.indexName,
                sortKey: {
                    name: lsi.sortKey.name,
                    type: getAttributeType(lsi.sortKey.type),
                },
                projectionType: getProjectionType(lsi.projectionType),
            };

            // Add non-key attributes if using INCLUDE projection
            if (lsi.projectionType === 'include' && lsi.nonKeyAttributes) {
                lsiProps.nonKeyAttributes = lsi.nonKeyAttributes;
            }

            table.addLocalSecondaryIndex(lsiProps);
        });
    }

    // Add tags
    if (tableConfig.tags) {
        Object.entries(tableConfig.tags).forEach(([key, value]) => {
            cdk.Tags.of(table).add(key, value);
        });
    }

    // Add resource-specific tags if provided
    if (resourceTags) {
        const tableTags = getResourceTags(resourceTags, ['dynamodb', 'table']);
        Object.entries(tableTags).forEach(([key, value]) => {
            cdk.Tags.of(table).add(key, value);
        });
    }

    return table;
}

/**
 * Generic CDK stack for serverless web applications
 * Supports multiple Lambda functions, DynamoDB tables, API Gateway, and custom domains
 */
export class LambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: LambdaStackProps) {
        super(scope, id, props);

        const { config } = props;
        const stackName = id;

        // Validate and normalize tags if provided
        let normalizedTags: Required<ResourceTagsConfig> | undefined;
        if (config.tags) {
            normalizedTags = validateAndNormalizeTags(
                config.tags,
                config.region,
                config.environment,
                config.appName
            );
        }

        // Apply global tags if specified
        if (config.globalTags) {
            Object.entries(config.globalTags).forEach(([key, value]) => {
                cdk.Tags.of(this).add(key, value);
            });
        }

        // Apply standardized resource tags to the entire stack
        if (normalizedTags) {
            const awsTags = toAwsTags(normalizedTags);
            Object.entries(awsTags).forEach(([key, value]) => {
                cdk.Tags.of(this).add(key, value);
            });
        }

        // Get global removal policy for tables
        const tableRemovalPolicy = getRemovalPolicy(config.removalPolicy, 'table');

        // Create all DynamoDB tables from configuration (if any)
        const tables: Map<string, dynamodb.Table> = new Map();
        if (config.dynamodb && config.dynamodb.tables) {
            config.dynamodb.tables.forEach((tableConfig, index) => {
                const tableId = `Table${index}`;
                const tableName = generateResourceName(config, tableConfig.name, stackName, normalizedTags)
                const table = createTable(this, tableId, tableName, tableConfig, tableRemovalPolicy, normalizedTags);
                tables.set(tableConfig.name, table);
            });
        }

        // Create AWS Secrets Manager secret (if any Lambda needs secrets)
        const needsSecrets = config.lambdas.some(l => l.needsSecrets);
        let appSecrets: secretsmanager.Secret | undefined;

        if (needsSecrets) {
            appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
                secretName: config.secretName!,
                description: `Application secrets for ${config.appName} ${config.environment} environment (stack: ${stackName})`,
                removalPolicy: getRemovalPolicy(config.removalPolicy, 'secrets')
            });

            // Apply resource-specific tags to secrets
            if (normalizedTags) {
                const secretTags = getResourceTags(normalizedTags, ['secrets', 'secrets-manager']);
                Object.entries(secretTags).forEach(([key, value]) => {
                    cdk.Tags.of(appSecrets!).add(key, value);
                });
            }
        }

        // Create table names map for environment variables
        const tableNamesMap: Record<string, string> = {};
        tables.forEach((table, tableName) => {
            tableNamesMap[tableName] = table.tableName;
        });

        // Create Lambda functions
        const lambdaFunctions: Map<string, lambda.Function> = new Map();

        config.lambdas.forEach((lambdaConfig: LambdaFunctionConfig) => {
            // CloudWatch Log Group for this Lambda
            const logGroupName = generateResourceName(config, `${config.appName}-LogGroup`, stackName,normalizedTags)
            const logGroup = new logs.LogGroup(this, logGroupName, {
                logGroupName: `/aws/lambda/${logGroupName}`,
                retention: config.logRetentionDays as logs.RetentionDays,
                removalPolicy: getRemovalPolicy(config.removalPolicy, 'logGroup'),
            });

            // Apply resource-specific tags to log group
            if (normalizedTags) {
                const logGroupTags = getResourceTags(normalizedTags, ['logs', 'cloudwatch', lambdaConfig.id]);
                Object.entries(logGroupTags).forEach(([key, value]) => {
                    cdk.Tags.of(logGroup).add(key, value);
                });
            }

            // Get Lambda architecture
            const lambdaArchitecture = getLambdaArchitecture(lambdaConfig.architecture);

            // Get Lambda runtime
            const lambdaRuntime = getLambdaRuntime(lambdaConfig.runtime!);

            // Get new Relic layer config
            const newRelicEnabled = lambdaConfig.newRelic!.enabled!;

            // Create Lambda layers if specified
            const lambdaLayers: lambda.ILayerVersion[] = [];
            if (lambdaConfig.layers && lambdaConfig.layers.length > 0) {
                lambdaConfig.layers.forEach((layerConfig, idx) => {
                    const layer = new lambda.LayerVersion(this, `${lambdaConfig.id}Layer${idx}`, {
                        layerVersionName: generateResourceName(config, `${config.appName}Layer${idx}`, stackName, normalizedTags),
                        code: lambda.Code.fromAsset(layerConfig.path),
                        compatibleRuntimes: layerConfig.compatibleRuntimes
                            ? layerConfig.compatibleRuntimes.map(r => getLambdaRuntime(r))
                            : [lambdaRuntime],
                        compatibleArchitectures: [lambdaArchitecture],
                        description: layerConfig.description,
                        removalPolicy: getRemovalPolicy(config.removalPolicy, 'lambdaLayer'),
                    });

                    // Apply resource-specific tags to layer
                    if (normalizedTags) {
                        const layerTags = getResourceTags(normalizedTags, ['lambda-layer', lambdaConfig.id, `layer${idx}`]);
                        Object.entries(layerTags).forEach(([key, value]) => {
                            cdk.Tags.of(layer).add(key, value);
                        });
                    }

                    lambdaLayers.push(layer);
                });
            }

            // Add New Relic if enabled
            if (newRelicEnabled) {
                const newRelicLayerArn = lambdaConfig.newRelic!.layerArn!;

                const newRelicLayer = lambda.LayerVersion.fromLayerVersionArn(
                    this,
                    `${lambdaConfig.id}NewRelicLayer`,
                    newRelicLayerArn
                );
                lambdaLayers.push(newRelicLayer);
            }

            // Build environment variables
            const environment: Record<string, string> = {
                ENVIRONMENT: config.environment,
                APP_NAME: config.appName,
                ...config.globalEnvironment,
                ...lambdaConfig.environment,
            };

            // Add DynamoDB table names
            if (tables.size > 0) {
                environment.DYNAMODB_TABLES = JSON.stringify(tableNamesMap);
                // For backward compatibility, set primary table
                const firstTable = Array.from(tables.values())[0];
                environment.DYNAMODB_TABLE_NAME = firstTable.tableName;
            }

            // Add OIDC config if specified
            if (config.oidc) {
                environment.OIDC_REDIRECT_PATH = config.oidc.redirectPath!;
                environment.OAUTH_ISSUER = config.oidc.issuer;
                environment.OIDC_CLIENT_ID = config.oidc.clientId;
            }

            // Add secrets ARN if needed
            if (lambdaConfig.needsSecrets && appSecrets) {
                environment.SECRETS_ARN = appSecrets.secretArn;
            }

            // Add New Relic configuration environment variables
            if (newRelicEnabled) {
                //Set license key
                environment.NEW_RELIC_LICENSE_KEY = lambdaConfig.newRelic!.licenseKey!;
                //Set lambda handler
                environment.NEW_RELIC_LAMBDA_HANDLER = lambdaConfig.handler;
                //Set account id
                environment.NEW_RELIC_ACCOUNT_ID = lambdaConfig.newRelic!.accountId!;
                // Set log enabled
                environment.NEW_RELIC_LOG_ENABLED = String(lambdaConfig.newRelic!.logEnabled!);
                // Set log level
                environment.NEW_RELIC_LOG_LEVEL = lambdaConfig.newRelic!.logLevel!;
                // Set extension log level
                environment.NEW_RELIC_EXTENSION_LOG_LEVEL = lambdaConfig.newRelic!.logLevel!;
                // Set extension send function logs
                environment.NEW_RELIC_EXTENSION_SEND_FUNCTION_LOGS = String(lambdaConfig.newRelic!.sendFunctionLogs!);
            }

            // Determine if we need to bundle Python dependencies
            const isPythonRuntime = lambdaRuntime.family === lambda.RuntimeFamily.PYTHON;
            const shouldBundle = isPythonRuntime && lambdaConfig.bundleDependencies;

            // Determine handler (New Relic Extension wraps the original handler if enabled)
            const lambdaHandler = newRelicEnabled? 'newrelic_lambda_wrapper.handler' : lambdaConfig.handler;

            let lambdaCode: lambda.Code;
            if (shouldBundle) {
                // Bundle Python dependencies during deployment
                lambdaCode = lambda.Code.fromAsset(lambdaConfig.codePath, {
                    exclude: lambdaConfig.exclude,
                    bundling: {
                        image: lambdaRuntime.bundlingImage,
                        command: [
                            'bash', '-c',
                            'pip install -r requirements.txt -t /asset-output && cp -au . /asset-output'
                        ],
                    },
                });
            } else {
                // Use code as-is without bundling
                lambdaCode = lambda.Code.fromAsset(lambdaConfig.codePath, {
                    exclude: lambdaConfig.exclude,
                });
            }

            // Create the Lambda function
            const lambdaFunction = new lambda.Function(this, `${lambdaConfig.id}Function`, {
                functionName: generateResourceName(config, `${config.appName}-Function`, stackName, normalizedTags),
                runtime: lambdaRuntime,
                handler: lambdaHandler,
                architecture: lambdaArchitecture,
                code: lambdaCode,
                layers: lambdaLayers,
                // Timeout conversion: if < 1, treat as minutes; otherwise seconds
                // Cap at 900 seconds (15 minutes) - AWS Lambda service limit
                timeout: cdk.Duration.seconds(
                    lambdaConfig.timeout! < 1
                        ? lambdaConfig.timeout! * 60
                        : Math.min(lambdaConfig.timeout! * 60, 900)
                ),
                memorySize: lambdaConfig.memory,
                environment,
                description: lambdaConfig.description,
            });

            // Associate log group
            lambdaFunction.node.addDependency(logGroup);

            // Apply resource-specific tags to Lambda function
            if (normalizedTags) {
                const lambdaTags = getResourceTags(normalizedTags, ['lambda', lambdaConfig.id]);
                Object.entries(lambdaTags).forEach(([key, value]) => {
                    cdk.Tags.of(lambdaFunction).add(key, value);
                });
            }

            // Grant DynamoDB permissions
            const tableAccess = lambdaConfig.tableAccess!;
            if (tableAccess.includes('*')) {
                // Grant access to all tables
                tables.forEach((table) => {
                    table.grantReadWriteData(lambdaFunction);
                });
            } else {
                // Grant access to specific tables
                tableAccess.forEach(tableName => {
                    const table = tables.get(tableName);
                    if (table) {
                        table.grantReadWriteData(lambdaFunction);
                    }
                });
            }

            // Grant secrets access if needed
            if (lambdaConfig.needsSecrets && appSecrets) {
                appSecrets.grantRead(lambdaFunction);
                if (newRelicEnabled && !lambdaConfig.newRelic!.licenseKey!)
                {
                    environment.NEW_RELIC_LICENSE_KEY = appSecrets.secretValueFromJson('NEW_RELIC_LICENSE_KEY').unsafeUnwrap();
                }
            }

            // Add custom policies if specified
            if (lambdaConfig.customPolicies) {
                lambdaConfig.customPolicies.forEach((policyStatement) => {
                    lambdaFunction.addToRolePolicy(iam.PolicyStatement.fromJson(policyStatement));
                });
            }

            lambdaFunctions.set(lambdaConfig.id, lambdaFunction);

            // Output Lambda function name
            new cdk.CfnOutput(this, `${lambdaConfig.id}FunctionName`, {
                value: lambdaFunction.functionName,
                description: `Lambda function name for ${lambdaConfig.id}`,
            });
        });

        // Create API Gateway or Function URLs based on deployment type
        if (config.deploymentType === 'lambda-function-url') {
            // Create function URLs for each Lambda
            config.lambdas.forEach((lambdaConfig) => {
                const lambdaFunction = lambdaFunctions.get(lambdaConfig.id)!;

                const functionUrl = lambdaFunction.addFunctionUrl({
                    authType: lambda.FunctionUrlAuthType.NONE,
                    cors: {
                        allowedOrigins: ['*'],
                        allowedMethods: [lambda.HttpMethod.ALL],
                        allowedHeaders: ['*'],
                        maxAge: cdk.Duration.hours(GLOBAL_DEFAULTS.corsMaxAge),
                    },
                });

                new cdk.CfnOutput(this, `${lambdaConfig.id}FunctionUrl`, {
                    value: functionUrl.url!,
                    description: `Lambda function URL for ${lambdaConfig.id}`,
                });
            });
        } else {
            // Create HTTP API Gateway - include stack name for uniqueness
            const apiName = generateResourceName(config, `${config.appName}`, stackName, normalizedTags)
            const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
                apiName: apiName,
                description: `HTTP API Gateway for ${config.appName} application (stack: ${stackName})`,
            });

            // Apply resource-specific tags to API Gateway
            if (normalizedTags) {
                const apiTags = getResourceTags(normalizedTags, ['api-gateway', 'http-api']);
                Object.entries(apiTags).forEach(([key, value]) => {
                    cdk.Tags.of(httpApi).add(key, value);
                });
            }

            // Add routes for each Lambda
            config.lambdas.forEach((lambdaConfig) => {
                const lambdaFunction = lambdaFunctions.get(lambdaConfig.id)!;

                // Grant API Gateway permission to invoke Lambda
                lambdaFunction.addPermission(`${lambdaConfig.id}ApiGatewayInvoke`, {
                    principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
                    action: 'lambda:InvokeFunction',
                });

                // Create Lambda integration
                const lambdaIntegration = new integrations.HttpLambdaIntegration(
                    `${lambdaConfig.id}Integration`,
                    lambdaFunction
                );

                // Add routes - use configured routes
                const routes = lambdaConfig.routes!;

                routes.forEach((route, idx) => {
                    httpApi.addRoutes({
                        path: route.path,
                        methods: route.methods.map(m => getHttpMethod(m)),
                        integration: lambdaIntegration,
                    });
                });
            });

            // Handle custom domain if enabled
            if (config.ingress?.enabled) {
                const domainName = config.ingress.domain!;
                const hostedZoneId = config.ingress.hostedZone!;
                const zoneName = config.ingress.zoneName!;

                const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'ExistingHostedZone', {
                    hostedZoneId: hostedZoneId,
                    zoneName: zoneName,
                });

                // Create certificate
                const certificate = new acm.Certificate(this, 'Certificate', {
                    domainName: domainName,
                    validation: acm.CertificateValidation.fromDns(hostedZone),
                });

                // Apply resource-specific tags to certificate
                if (normalizedTags) {
                    const certTags = getResourceTags(normalizedTags, ['acm', 'certificate', 'tls']);
                    Object.entries(certTags).forEach(([key, value]) => {
                        cdk.Tags.of(certificate).add(key, value);
                    });
                }

                // Custom Domain & DNS
                const customDomain = new apigwv2.DomainName(this, 'CustomDomain', {
                    domainName,
                    certificate,
                });

                // Apply resource-specific tags to custom domain
                if (normalizedTags) {
                    const domainTags = getResourceTags(normalizedTags, ['custom-domain', 'api-gateway']);
                    Object.entries(domainTags).forEach(([key, value]) => {
                        cdk.Tags.of(customDomain).add(key, value);
                    });
                }

                new apigwv2.ApiMapping(this, 'ApiMapping', {
                    api: httpApi,
                    domainName: customDomain,
                    stage: httpApi.defaultStage!,
                });

                new route53.ARecord(this, 'ApiDnsRecord', {
                    zone: hostedZone,
                    recordName: domainName,
                    target: route53.RecordTarget.fromAlias(new targets.ApiGatewayv2DomainProperties(
                        customDomain.regionalDomainName,
                        customDomain.regionalHostedZoneId
                    )),
                });

                new cdk.CfnOutput(this, 'ApiUrl', {
                    value: `https://${domainName}`,
                    description: 'API Gateway custom domain URL',
                });
            } else {
                // Output the API Gateway URL
                new cdk.CfnOutput(this, 'ApiUrl', {
                    value: httpApi.url!,
                    description: 'API Gateway URL',
                });
            }
        }

        // Output DynamoDB table names
        tables.forEach((table, tableName) => {
            const sanitizedName = tableName.replace(/[^a-zA-Z0-9]/g, '');
            new cdk.CfnOutput(this, `DynamoTableName${sanitizedName}`, {
                value: table.tableName,
                description: `DynamoDB table name: ${tableName}`,
            });
        });

        // Output secrets ARN if created
        if (appSecrets) {
            new cdk.CfnOutput(this, 'SecretsArn', {
                value: appSecrets.secretArn,
                description: 'Secrets Manager ARN',
            });
        }
    }
}

export default LambdaStack;

