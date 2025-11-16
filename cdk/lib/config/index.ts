/**
 * CDK Configuration Module
 * 
 * This module provides configuration management for deployments.
 * Import from this index file to access all configuration functionality.
 */

// Export all types
export * from './types';

// Export default application logic
export { applyTableDefaults, normalizeRemovalPolicy } from './defaults';

// Export CDK converters
export * from './converters';

// Export configuration loader
export { loadConfig } from './loader';

// Export tag utilities
export * from './tags';

