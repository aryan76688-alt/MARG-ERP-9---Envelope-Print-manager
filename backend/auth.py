import os
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from models import User
import requests
import bcrypt

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "b304c000e3cf14a1a9a83ebfc481358a9e701a238622fba5e808c160")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days
GOOGLE_CLIENT_ID = os.environ.get(
    "GOOGLE_CLIENT_ID",
    "58565275888-4juppeh2cdeo6v4tn1qc81e8ngpnevsu.apps.googleusercontent.com"
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def verify_google_id_token(id_token: str, expected_client_id: Optional[str] = None) -> dict:
    """
    Verifies a Google ID Token using Google's public tokeninfo endpoint.
    Validates audience, issuer, expiry, and returns decoded token profile.
    """
    if not id_token or not id_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google ID token is required"
        )
    target_client_id = (expected_client_id or GOOGLE_CLIENT_ID).strip()
    
    try:
        url = "https://oauth2.googleapis.com/tokeninfo"
        res = requests.get(url, params={"id_token": id_token.strip()}, timeout=10)
        if res.status_code != 200:
            error_data = {}
            try:
                error_data = res.json()
            except Exception:
                pass
            err_msg = error_data.get("error_description") or error_data.get("error") or "Failed to verify token with Google"
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Google token verification failed: {err_msg}"
            )
        payload = res.json()
    except requests.exceptions.RequestException as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to reach Google OAuth verification servers: {str(e)}"
        )

    # Validate Issuer
    iss = payload.get("iss", "")
    if iss not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token issuer: {iss}"
        )

    # Validate Audience (aud or azp)
    token_aud = payload.get("aud")
    token_azp = payload.get("azp")
    target_prefix = target_client_id.split("-")[0] if "-" in target_client_id else target_client_id
    
    valid_aud = (
        token_aud == target_client_id or
        token_azp == target_client_id or
        (token_aud and target_prefix in token_aud) or
        (token_azp and target_prefix in token_azp)
    )
    if not valid_aud:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token client ID mismatch (expected {target_client_id}, got aud={token_aud})"
        )

    return payload

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = db.query(User).filter(User.username == username).first()
    if user is None or not user.is_active:
        raise credentials_exception
    return user

def get_current_active_admin(current_user: User = Depends(get_current_user)):
    if current_user.role not in ["super_admin", "admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

def get_current_super_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")
    return current_user
