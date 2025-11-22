import os
import uuid

import boto3
from auth.api_auth import require_api_auth
from auth.core_auth import init_auth
from botocore.exceptions import ClientError
from flask import Flask, flash, jsonify, redirect, render_template, request, url_for
from mulio.utils.secrets_util import get_secrets

app = Flask(__name__)

# Get secrets from secrets manager (cached after first call)
secrets = get_secrets()
app.secret_key = secrets.secret_key

require_login = init_auth(app)

# DynamoDB configuration
DYNAMODB_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME")
AWS_REGION = os.environ.get("AWS_REGION")

# Initialize DynamoDB client
dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
table = dynamodb.Table(DYNAMODB_TABLE_NAME)


class ClientModel:
    """Model class for handling DynamoDB operations"""

    @staticmethod
    def create_client(client_name, use_fallback):
        """Create a new client"""
        try:
            client_id = str(uuid.uuid4())
            item = {
                "client_id": client_id,
                "client_name": client_name,
                "use_fallback": use_fallback,
            }
            table.put_item(Item=item)
            return client_id
        except ClientError as e:
            raise Exception(f"Error creating client: {str(e)}")

    @staticmethod
    def get_client(client_id):
        """Get a client by ID"""
        try:
            response = table.get_item(Key={"client_id": client_id})
            return response.get("Item")
        except ClientError as e:
            raise Exception(f"Error getting client: {str(e)}")

    @staticmethod
    def get_all_clients():
        """Get all clients"""
        try:
            response = table.scan()
            return response.get("Items", [])
        except ClientError as e:
            raise Exception(f"Error getting clients: {str(e)}")

    @staticmethod
    def update_client(client_id, client_name, use_fallback):
        """Update a client"""
        try:
            table.update_item(
                Key={"client_id": client_id},
                UpdateExpression="SET client_name = :name, use_fallback = :fallback",
                ExpressionAttributeValues={
                    ":name": client_name,
                    ":fallback": use_fallback,
                },
            )
            return True
        except ClientError as e:
            raise Exception(f"Error updating client: {str(e)}")

    @staticmethod
    def delete_client(client_id):
        """Delete a client"""
        try:
            table.delete_item(Key={"client_id": str(client_id)})
            return True
        except ClientError as e:
            raise Exception(f"Error deleting client: {str(e)}")


# Routes
@app.route("/")
def index():
    try:
        clients = ClientModel.get_all_clients()
        return render_template("index.html", clients=clients)
    except Exception as e:
        flash(f"Error loading clients: {str(e)}", "error")
        return render_template("index.html", clients=[])


@app.route("/client/new", methods=["GET", "POST"])
def new_client():
    """Create a new client"""
    if request.method == "POST":
        client_name = request.form.get("client_name", "").strip()
        use_fallback = request.form.get("use_fallback") == "on"

        if not client_name:
            flash("Client name is required", "error")
            return render_template("client_form.html")

        try:
            client_id = ClientModel.create_client(client_name, use_fallback)
            flash(f"Client created successfully with ID: {client_id}", "success")
            return redirect(url_for("index"))
        except Exception as e:
            flash(f"Error creating client: {str(e)}", "error")
            return render_template("client_form.html")

    return render_template("client_form.html")


@app.route("/client/<client_id>")
def view_client(client_id):
    """View a specific client"""
    try:
        client = ClientModel.get_client(client_id)
        if not client:
            flash("Client not found", "error")
            return redirect(url_for("index"))
        return render_template("client_detail.html", client=client)
    except Exception as e:
        flash(f"Error loading client: {str(e)}", "error")
        return redirect(url_for("index"))


@app.route("/client/<client_id>/edit", methods=["GET", "POST"])
def edit_client(client_id):
    """Edit a client"""
    try:
        client = ClientModel.get_client(client_id)
        if not client:
            flash("Client not found", "error")
            return redirect(url_for("index"))

        if request.method == "POST":
            client_name = request.form.get("client_name", "").strip()
            use_fallback = request.form.get("use_fallback") == "on"

            if not client_name:
                flash("Client name is required", "error")
                return render_template("client_form.html", client=client, is_edit=True)

            try:
                ClientModel.update_client(client_id, client_name, use_fallback)
                flash("Client updated successfully", "success")
                return redirect(url_for("view_client", client_id=client_id))
            except Exception as e:
                flash(f"Error updating client: {str(e)}", "error")
                return render_template("client_form.html", client=client, is_edit=True)

        return render_template("client_form.html", client=client, is_edit=True)

    except Exception as e:
        flash(f"Error loading client: {str(e)}", "error")
        return redirect(url_for("index"))


@app.route("/client/<client_id>/delete", methods=["POST"])
def delete_client(client_id):
    """Delete a client"""
    try:
        ClientModel.delete_client(client_id)
        flash("Client deleted successfully", "success")
    except Exception as e:
        flash(f"Error deleting client: {str(e)}", "error")

    return redirect(url_for("index"))


# API endpoints for programmatic access
@app.route("/api/clients", methods=["GET"])
@require_api_auth
def api_get_clients():
    """API endpoint to get all clients"""
    try:
        clients = ClientModel.get_all_clients()
        return jsonify({"clients": clients})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/clients", methods=["POST"])
@require_api_auth
def api_create_client():
    """API endpoint to create a client"""
    try:
        data = request.get_json()
        client_name = data.get("client_name", "").strip()
        use_fallback = data.get("use_fallback", False)

        if not client_name:
            return jsonify({"error": "client_name is required"}), 400

        client_id = ClientModel.create_client(client_name, use_fallback)
        return (
            jsonify({"client_id": client_id, "message": "Client created successfully"}),
            201,
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/clients/<client_id>", methods=["GET"])
@require_api_auth
def api_get_client(client_id):
    """API endpoint to get a specific client"""
    try:
        client = ClientModel.get_client(client_id)
        if not client:
            return jsonify({"error": "Client not found"}), 404
        return jsonify({"client": client})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/clients/<client_id>", methods=["PUT"])
@require_api_auth
def api_update_client(client_id):
    """API endpoint to update a client"""
    try:
        data = request.get_json()
        client_name = data.get("client_name", "").strip()
        use_fallback = data.get("use_fallback", False)

        if not client_name:
            return jsonify({"error": "client_name is required"}), 400

        ClientModel.update_client(client_id, client_name, use_fallback)
        return jsonify({"message": "Client updated successfully"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/clients/<client_id>", methods=["DELETE"])
@require_api_auth
def api_delete_client(client_id):
    """API endpoint to delete a client"""
    try:
        ClientModel.delete_client(client_id)
        return jsonify({"message": "Client deleted successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/health")
def health():
    """Health check endpoint"""
    return jsonify({"status": "healthy"}), 200


# --- Protect ALL routes with authentication ---
app.view_functions["index"] = require_login(app.view_functions["index"])
app.view_functions["new_client"] = require_login(app.view_functions["new_client"])
app.view_functions["view_client"] = require_login(app.view_functions["view_client"])
app.view_functions["edit_client"] = require_login(app.view_functions["edit_client"])
app.view_functions["delete_client"] = require_login(app.view_functions["delete_client"])

if __name__ == "__main__":
    DEBUG = os.environ.get("DEBUG", "False").lower() == "true"
    app.run(debug=DEBUG, host="0.0.0.0", port=8080)
