"""Typed application exceptions.

The API layer maps these to HTTP responses in one place (main.py),
so services and agents never import fastapi.HTTPException.
"""


class AppError(Exception):
    """Base for all application errors."""

    status_code = 500
    code = "internal_error"

    def __init__(self, message: str = "Internal error"):
        self.message = message
        super().__init__(message)


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ConflictError(AppError):
    status_code = 409
    code = "conflict"


class UnauthorizedError(AppError):
    status_code = 401
    code = "unauthorized"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"


class ValidationFailedError(AppError):
    status_code = 422
    code = "validation_failed"


# --- Provider errors (raised by infrastructure adapters) ---


class ProviderError(AppError):
    status_code = 502
    code = "provider_error"


class ProviderRateLimitedError(ProviderError):
    code = "provider_rate_limited"


class ProviderUnavailableError(ProviderError):
    code = "provider_unavailable"


class ProviderContentError(ProviderError):
    """Provider returned unusable content (e.g. unparseable JSON)."""

    code = "provider_content_error"


class PipelineError(AppError):
    status_code = 500
    code = "pipeline_error"
