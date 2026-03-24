"""
JWT authentication utilities.
Credentials are read from environment variables ADMIN_USER and ADMIN_PASS.
"""

import os
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY env var is required — set it in .env")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

VALID_USERNAME = os.getenv("ADMIN_USER", "")
VALID_PASSWORD = os.getenv("ADMIN_PASS", "")
if not VALID_USERNAME or not VALID_PASSWORD:
    raise RuntimeError("ADMIN_USER and ADMIN_PASS env vars are required — set them in .env")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")


def authenticate_user(username: str, password: str) -> bool:
    return username == VALID_USERNAME and password == VALID_PASSWORD


def create_access_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(token: str) -> str:
    """Verify JWT and return the username (sub). Raises on failure."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise JWTError("Missing subject")
        return username
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
    """FastAPI dependency — returns username from valid JWT."""
    return verify_token(token)
