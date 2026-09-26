from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
import os
import traceback

from app.db.init_db import init_db
from app.routers import auth, students, exams, attempts, proctoring, reports, admin, classes, attendance

# ── One-time schema bootstrap (sync, runs before ASGI event loop starts) ──────
init_db()

# ── Rate limiter (Fix #11) ─────────────────────────────────────────────────────
# Uses client IP as the key. Limits are applied per-route via @limiter.limit().
limiter = Limiter(key_func=get_remote_address, default_limits=[])

app = FastAPI(
    title="SecureExam AI",
    description="Proctored online exam portal backend",
    version="1.0.0"
)

# Attach rate limiter to app state so routers can access it
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ── Global exception handler ───────────────────────────────────────────────────
# Catches any unhandled Python exception and returns a clean JSON response
# instead of crashing with a raw 500 traceback visible to clients.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"[Unhandled Error] {request.method} {request.url}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again."}
    )

# ── CORS middleware ────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # Lock down to specific domains in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount static storage folder to serve evidence files ───────────────────────
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/api/storage", StaticFiles(directory=STORAGE_DIR), name="api_storage")
app.mount("/storage",     StaticFiles(directory=STORAGE_DIR), name="storage")

# ── Wire all routers ───────────────────────────────────────────────────────────
app.include_router(auth.router,       prefix="/api/auth",       tags=["Authentication"])
app.include_router(admin.router,      prefix="/api/admin",      tags=["Admin Operations"])
app.include_router(students.router,   prefix="/api/students",   tags=["Students"])
app.include_router(classes.router,    prefix="/api/classes",    tags=["Classes"])
app.include_router(exams.router,      prefix="/api/exams",      tags=["Exams"])
app.include_router(attempts.router,   prefix="/api/attempts",   tags=["Attempts"])
app.include_router(proctoring.router, prefix="/api/proctoring", tags=["Proctoring"])
app.include_router(reports.router,    prefix="/api/reports",    tags=["Reports"])
app.include_router(attendance.router, prefix="/api/attendance", tags=["Attendance"])


@app.get("/")
async def read_root():
    return {"message": "SecureExam AI API is running"}
