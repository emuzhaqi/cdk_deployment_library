from apig_wsgi import make_lambda_handler
from app import app


def lambda_handler(event, context):
    handler = make_lambda_handler(app)
    return handler(event, context)
