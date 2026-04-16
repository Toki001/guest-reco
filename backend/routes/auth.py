from fastapi import APIRouter, HTTPException, Depends, Request, Form
from auth import check_login, require_admin
from services.rate_limiter import check_rate_limit

router = APIRouter()


@router.post('/login')
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(f"login:{client_ip}"):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
    token = check_login(username, password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": token, "username": username}


@router.get('/me')
async def auth_me(user=Depends(require_admin)):
    return {"username": user["sub"]}
