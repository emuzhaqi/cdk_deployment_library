#!/usr/bin/env node
/**
 * Secrets management CLI tool
 * Integrates with CDK configuration to populate AWS Secrets Manager secrets
 */

import { loadConfig } from '../lib/config/loader';
import {
    SecretsManagerClient,
    PutSecretValueCommand,
    GetSecretValueCommand,
    ResourceNotFoundException
} from '@aws-sdk/client-secrets-manager';
import * as readline from 'readline';
import * as crypto from 'crypto';

interface CLIArgs {
    envName: string;
    dryRun: boolean;
    viewOnly: boolean;
    profile: string;
    region: string;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CLIArgs {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        printUsage();
        process.exit(0);
    }

    // Filter out flag arguments to find the environment name
    const flagArgs = ['--dry-run', '--view', '--profile', '--region', '--help', '-h'];
    const nonFlagArgs = args.filter((arg, index) => {
        // Skip if it's a flag
        if (flagArgs.includes(arg)) return false;
        // Skip if it's a value for a flag (preceded by --profile or --region)
        if (index > 0 && (args[index - 1] === '--profile' || args[index - 1] === '--region')) return false;
        return true;
    });

    if (nonFlagArgs.length === 0) {
        console.error('Error: Environment name is required');
        printUsage();
        process.exit(1);
    }

    const envName = nonFlagArgs[0];
    const dryRun = args.includes('--dry-run');
    const viewOnly = args.includes('--view');
    const profile = getArgValue(args, '--profile') || process.env.AWS_PROFILE || 'default';
    const region = getArgValue(args, '--region') || process.env.AWS_REGION || 'us-east-1';

    return { envName, dryRun, viewOnly, profile, region };
}

/**
 * Get value for a command line argument
 */
function getArgValue(args: string[], argName: string): string | undefined {
    const index = args.indexOf(argName);
    if (index !== -1 && index + 1 < args.length) {
        return args[index + 1];
    }
    return undefined;
}

/**
 * Print usage information
 */
function printUsage(): void {
    console.log(`
Secrets Management CLI

Usage:
  npm run secrets:populate -- <environment> [options]
  npm run secrets:view -- <environment> [options]

Arguments:
  <environment>     Environment name (e.g., dev, qa, prod, alex)

Options:
  --dry-run         Show what would be done without making changes
  --view            View existing secret values (does not prompt for new values)
  --profile <name>  AWS profile to use (default: AWS_PROFILE env var or 'default')
  --region <name>   AWS region (default: AWS_REGION env var or 'us-east-1')
  --help, -h        Show this help message

Examples:
  npm run secrets:populate -- dev
  npm run secrets:populate -- alex --profile dev-account
  npm run secrets:populate -- prod --dry-run
  npm run secrets:view -- dev
`);
}

/**
 * Create AWS Secrets Manager client with profile
 */
function createSecretsClient(profile: string, region: string): SecretsManagerClient {
    // Note: AWS SDK v3 doesn't use profile directly in client config
    // Profile should be set via AWS_PROFILE environment variable or AWS credentials file
    return new SecretsManagerClient({
        region,
        // If profile is not 'default', user should set AWS_PROFILE env var
    });
}

/**
 * Fetch existing secret values from AWS Secrets Manager
 */
async function fetchExistingSecrets(
    secretName: string,
    client: SecretsManagerClient
): Promise<Record<string, string>> {
    try {
        const command = new GetSecretValueCommand({ SecretId: secretName });
        const response = await client.send(command);

        if (response.SecretString) {
            try {
                return JSON.parse(response.SecretString);
            } catch (parseError) {
                console.error('\nWarning: Secret exists but is not in valid JSON format.');
                console.error('The secret must be a JSON object like: {"SECRET_KEY": "value", "OIDC_CLIENT_SECRET": "value"}');
                console.error('\nCurrent secret value appears to be a plain string, not a JSON object.');
                console.error('You can fix this by running the populate command to overwrite it with the correct format.\n');
                return {};
            }
        }
        return {};
    } catch (error: any) {
        if (error instanceof ResourceNotFoundException) {
            console.log('Secret does not exist yet. Will create new secret.');
            return {};
        }
        throw error;
    }
}

/**
 * Prompt user for a secret value
 */
async function promptForValue(
    key: string,
    description: string,
    existingValue?: string
): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        const prompt = existingValue
            ? `${description} (${key}) [existing value hidden, press Enter to keep]: `
            : `${description} (${key}): `;

        rl.question(prompt, (answer) => {
            rl.close();

            // If user pressed Enter and there's an existing value, keep it
            if (!answer && existingValue) {
                resolve(existingValue);
            } else if (answer) {
                resolve(answer);
            } else {
                // No answer and no existing value, prompt again
                console.log('Value cannot be empty. Please try again.');
                promptForValue(key, description, existingValue).then(resolve);
            }
        });
    });
}

/**
 * Update secret in AWS Secrets Manager
 */
async function updateSecret(
    secretName: string,
    secretValues: Record<string, string>,
    client: SecretsManagerClient
): Promise<void> {
    const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(secretValues)
    });

    await client.send(command);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
    try {
        const args = parseArgs();

        console.log('═══════════════════════════════════════════════════');
        console.log('  Mulio Secrets Management');
        console.log('═══════════════════════════════════════════════════');
        console.log();

        // Load config (this will validate secrets config including duplicates)
        console.log(`Loading configuration for environment: ${args.envName}`);
        const config = loadConfig(args.envName);

        if (!config.secretName) {
            console.log('No secrets configured for this environment.');
            process.exit(0);
        }

        console.log(`Secret Name: ${config.secretName}`);
        console.log(`AWS Profile: ${args.profile}`);
        console.log(`AWS Region: ${args.region}`);
        console.log();

        // Create AWS client
        const client = createSecretsClient(args.profile, args.region);

        // Collect all secret fields from all Lambdas that need secrets
        const allSecretFields = config.lambdas
            .filter(l => l.needsSecrets && l.secretsConfig)
            .flatMap(l => l.secretsConfig!.fields);

        if (allSecretFields.length === 0) {
            console.log('No secret fields configured.');
            process.exit(0);
        }

        console.log(`Found ${allSecretFields.length} secret field(s) to manage:`);
        allSecretFields.forEach(field => {
            console.log(`  - ${field.key}: ${field.description}`);
        });
        console.log();

        // View mode: just show existing secrets
        if (args.viewOnly) {
            console.log('Fetching existing secret values...');
            const existingValues = await fetchExistingSecrets(config.secretName, client);

            if (Object.keys(existingValues).length === 0) {
                console.log('No existing secret values found.');
            } else {
                console.log('Existing secrets (keys only):');
                Object.keys(existingValues).forEach(key => {
                    const hasValue = existingValues[key] && existingValues[key].length > 0;
                    console.log(`  ${key}: ${hasValue ? '[VALUE SET]' : '[EMPTY]'}`);
                });
            }
            process.exit(0);
        }

        // Fetch existing secret values
        console.log('Fetching existing secret values...');
        const existingValues = await fetchExistingSecrets(config.secretName, client);
        console.log();

        // Collect values for each field
        const secretValues: Record<string, string> = {};

        for (const field of allSecretFields) {
            if (field.generator === 'random') {
                // Auto-generate random value
                secretValues[field.key] = crypto.randomBytes(32).toString('base64');
                console.log(`✓ Generated random value for ${field.key}`);
            } else {
                // Prompt user for value
                const existing = existingValues[field.key];
                const value = await promptForValue(field.key, field.description, existing);
                secretValues[field.key] = value;
                console.log(`✓ Set value for ${field.key}`);
            }
        }

        console.log();

        // Update secret in AWS
        if (args.dryRun) {
            console.log('═══════════════════════════════════════════════════');
            console.log('  DRY RUN - No changes made');
            console.log('═══════════════════════════════════════════════════');
            console.log();
            console.log('Would update secret with the following keys:');
            Object.keys(secretValues).forEach(key => {
                console.log(`  - ${key}`);
            });
        } else {
            console.log('Updating secret in AWS Secrets Manager...');
            await updateSecret(config.secretName, secretValues, client);
            console.log();
            console.log('═══════════════════════════════════════════════════');
            console.log('  ✓ Secret updated successfully!');
            console.log('═══════════════════════════════════════════════════');
            console.log();
            console.log(`Secret ARN will be available after CDK deployment.`);
        }

    } catch (error: any) {
        console.error();
        console.error('═══════════════════════════════════════════════════');
        console.error('  ERROR');
        console.error('═══════════════════════════════════════════════════');
        console.error();
        console.error(error.message || error);
        console.error();

        if (error.name === 'ResourceNotFoundException') {
            console.error('The secret does not exist in AWS Secrets Manager.');
            console.error('Please deploy your CDK stack first to create the secret.');
        }

        process.exit(1);
    }
}

// Run main function
main();

