import os
from functools import wraps
from flask import Blueprint, session, redirect, request, url_for, current_app
from authlib.integrations.flask_client import OAuth
from urllib.parse import urlencode

from mulio.utils.secrets_util import get_secrets


def init_auth(app):
    # Get cached secrets
    secrets = get_secrets()

    issuer = os.environ.get("OAUTH_ISSUER")
    client_id = os.environ.get("OIDC_CLIENT_ID")
    client_secret = secrets.oidc_client_secret
    redirect_path = os.environ.get("OIDC_REDIRECT_PATH", "/auth/callback")

    if not app.secret_key:
        app.secret_key = secrets.secret_key

    # Initialize OAuth
    oauth = OAuth(app)
    oauth.register(
        name="keycloak",
        server_metadata_url=f"{issuer}/.well-known/openid-configuration",
        client_id=client_id,
        client_secret=client_secret,
        client_kwargs={"scope": "openid profile email"},
    )

    bp = Blueprint("auth", __name__)

    @bp.route("/login")
    def login():
        """Initiate OAuth 2.0 login flow"""
        callback_url = request.url_root.rstrip("/") + redirect_path
        return oauth.keycloak.authorize_redirect(redirect_uri=callback_url)

    @bp.route(redirect_path, endpoint="callback")
    def callback():
        """Handle OAuth 2.0 callback"""
        try:
            token = oauth.keycloak.authorize_access_token()
            userinfo = oauth.keycloak.parse_id_token(token, nonce=None)

            session["user"] = {
                "sub": userinfo.get("sub"),
                "name": userinfo.get("name") or userinfo.get("preferred_username"),
                "email": userinfo.get("email"),
            }
            session["id_token"] = token.get("id_token")

            next_url = session.pop("post_login_redirect", url_for("index"))
            return redirect(next_url)

        except Exception as e:
            current_app.logger.error(f"OAuth callback error: {e}")
            return redirect(url_for("index"))

    @bp.route("/logout")
    def logout():
        id_token = session.get("id_token")
        session.clear()

        if issuer:
            params = {
                "post_logout_redirect_uri": request.url_root.rstrip("/") + "/login"
            }
            params["id_token_hint"] = id_token

            end_session_url = f"{issuer.rstrip('/')}/protocol/openid-connect/logout?{urlencode(params)}"
            return redirect(end_session_url)

        return redirect(url_for("auth.login"))

    if not hasattr(app, "_auth_blueprint_registered"):
        app.register_blueprint(bp)
        app._auth_blueprint_registered = True

    def require_login(view_func):
        """Decorator to require authentication for routes"""

        @wraps(view_func)
        def wrapper(*args, **kwargs):
            if "user" not in session:
                session["post_login_redirect"] = request.full_path
                return redirect(url_for("auth.login"))
            return view_func(*args, **kwargs)

        return wrapper

    def get_current_user():
        """Helper function to get current user from session"""
        return session.get("user")

    app.jinja_env.globals["get_current_user"] = get_current_user

    return require_login
