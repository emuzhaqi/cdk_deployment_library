import os
import jwt
import requests
from functools import wraps
from flask import request, jsonify
from typing import Dict, Any, Optional


def validate_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """
    Validate JWT token against Keycloak
    """
    try:
        # Get Keycloak configuration
        issuer = os.environ.get("OAUTH_ISSUER")
        client_id = os.environ.get("OIDC_CLIENT_ID")

        if not issuer or not client_id:
            print("OAUTH_ISSUER or OIDC_CLIENT_ID not configured")
            return None

        # Get Keycloak's public keys for token verification
        jwks_url = f"{issuer}/protocol/openid-connect/certs"
        jwks_response = requests.get(jwks_url, timeout=10)
        jwks_response.raise_for_status()
        jwks = jwks_response.json()

        # Decode the token header to get the key ID
        unverified_header = jwt.get_unverified_header(token)
        key_id = unverified_header.get("kid")

        # Find the matching public key
        public_key = None
        for key in jwks.get("keys", []):
            if key.get("kid") == key_id:
                public_key = jwt.algorithms.RSAAlgorithm.from_jwk(key)
                break

        if not public_key:
            print(f"No matching key found for kid: {key_id}")
            return None

        # Verify and decode the token
        decoded_token = jwt.decode(
            token, public_key, algorithms=["RS256"], audience=client_id, issuer=issuer
        )

        # Extract user information
        user_info = {
            "sub": decoded_token.get("sub"),
            "name": decoded_token.get("name")
            or decoded_token.get("preferred_username"),
            "email": decoded_token.get("email"),
            "roles": decoded_token.get("realm_access", {}).get("roles", []),
        }

        return user_info

    except jwt.ExpiredSignatureError:
        print("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"Invalid token: {str(e)}")
        return None
    except Exception as e:
        print(f"Token validation error: {str(e)}")
        return None


def extract_token_from_request() -> Optional[str]:
    """Extract JWT token from the request"""
    try:
        # Check Authorization header
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[7:]  # Remove 'Bearer ' prefix

        # Check for token in query parameters (alternative)
        return request.args.get("token")

    except Exception:
        return None


def require_api_auth(f):
    """
    Decorator to require JWT authentication for API routes
    """

    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Extract token from request
        token = extract_token_from_request()

        if not token:
            return (
                jsonify(
                    {
                        "error": "Authorization token required",
                        "message": "Please provide a valid JWT token in the Authorization header",
                    }
                ),
                401,
            )

        # Validate the token
        user_info = validate_jwt_token(token)

        if not user_info:
            return (
                jsonify(
                    {
                        "error": "Invalid or expired token",
                        "message": "The provided token is invalid or has expired",
                    }
                ),
                401,
            )

        # Add user info to request context for use in the route
        request.api_user = user_info

        return f(*args, **kwargs)

    return decorated_function
