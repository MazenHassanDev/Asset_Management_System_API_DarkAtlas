"""
Consistent error envelope for the whole API:

    { "error": { "code": "...", "message": "...", "details": {...} } }

Views should *raise* (NotFound, Conflict, is_valid(raise_exception=True)) and let
this handler shape the response. `details` is only included for validation errors.
"""

from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.views import exception_handler as drf_exception_handler


class Conflict(APIException):
    "409 — e.g. a duplicate asset."
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This conflicts with an existing resource."
    default_code = "conflict"


def custom_exception_handler(exc, context):
    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # not DRF-handled (e.g. 500) — let Django deal with it.

    data = response.data
    if isinstance(data, dict) and list(data) == ["detail"]:
        # Simple errors like 401/403/404/409: {"detail": "..."}
        body = {"code": getattr(exc, "default_code", "error"), "message": str(data["detail"])}
    else:
        # Validation errors: a field map / list of messages.
        body = {"code": "validation_error", "message": "Validation failed.", "details": data}

    response.data = {"error": body}
    return response
