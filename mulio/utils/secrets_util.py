import json
import os
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.exceptions import ClientError


@dataclass
class Secrets:
    """
    Typed DTO for application secrets.
    All secrets are loaded once and cached at module level.

    Returns:
        Secrets instance with all required secrets populated
    """

    secret_key: str
    oidc_client_secret: str
    new_relic_license_key: str | None = None

    @classmethod
    def from_dict(cls, data: dict) -> "Secrets":
        """
        Create Secrets instance from dictionary.
        Raises clear errors if required secrets are missing.

        Args:
            data: Dictionary of secrets from AWS Secrets Manager

        Returns:
            Secrets instance with all required secrets

        Raises:
            ValueError: If any required secrets are missing
        """
        missing = []

        secret_key = data.get("SECRET_KEY")
        if not secret_key or not isinstance(secret_key, str):
            missing.append("SECRET_KEY")

        oidc_client_secret = data.get("OIDC_CLIENT_SECRET")
        if not oidc_client_secret or not isinstance(oidc_client_secret, str):
            missing.append("OIDC_CLIENT_SECRET")

        if missing:
            raise ValueError(
                f"Missing required secrets: {', '.join(missing)}. "
                f"Run 'npm run secrets:populate -- <env>' from the cdk directory to configure secrets."
            )

        # New Relic license key is optional
        new_relic_license_key = data.get("NEW_RELIC_LICENSE_KEY")
        if new_relic_license_key is not None and not isinstance(new_relic_license_key, str):
            new_relic_license_key = None

        return cls(
            secret_key=str(secret_key),
            oidc_client_secret=str(oidc_client_secret),
            new_relic_license_key=new_relic_license_key,
        )


def _fetch_secrets_from_aws() -> dict[str, Any]:
    """
    Internal function to fetch secrets from AWS Secrets Manager.
    This should only be called once at module initialization.

    Returns:
        Dictionary of secrets from AWS Secrets Manager, or empty dict on error
    """
    try:
        secrets_arn = os.environ.get("SECRETS_ARN")
        if not secrets_arn:
            print("SECRETS_ARN environment variable not set")
            return {}

        client = boto3.client("secretsmanager")
        response = client.get_secret_value(SecretId=secrets_arn)
        secret_string: str = response.get("SecretString", "{}")
        result: dict[str, Any] = json.loads(secret_string)
        return result
    except ClientError as e:
        print(f"Error fetching secrets from AWS Secrets Manager: {str(e)}")
        return {}
    except Exception as e:
        print(f"Error fetching secrets: {str(e)}")
        return {}


# Module-level cache: secrets are fetched once when the module is first imported
_secrets_cache: Secrets | None = None


def get_secrets() -> Secrets:
    """
    Get application secrets as a typed DTO.

    Secrets are fetched from AWS Secrets Manager on the first call and cached in memory.
    Subsequent calls return the cached instance without hitting AWS Secrets Manager.

    Returns:
        Secrets instance containing all application secrets
    """
    global _secrets_cache

    if _secrets_cache is None:
        secrets_dict = _fetch_secrets_from_aws()
        _secrets_cache = Secrets.from_dict(secrets_dict)

    return _secrets_cache
