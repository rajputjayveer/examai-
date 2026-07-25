from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.db.init_db import init_db
from app.routers import auth, students, exams, attempts, proctoring, reports, admin, classes

# Create tables
init_db()

app = FastAPI(
    title="SecureExam AI",
    description="Proctored online exam portal backend",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, lock this down
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static storage folder to serve evidence files
STORAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)
app.mount("/api/storage", StaticFiles(directory=STORAGE_DIR), name="storage")

# Wire routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin Operations"])
app.include_router(students.router, prefix="/api/students", tags=["Students"])
app.include_router(classes.router, prefix="/api/classes", tags=["Classes"])
app.include_router(exams.router, prefix="/api/exams", tags=["Exams"])
app.include_router(attempts.router, prefix="/api/attempts", tags=["Attempts"])
app.include_router(proctoring.router, prefix="/api/proctoring", tags=["Proctoring"])
app.include_router(reports.router, prefix="/api/reports", tags=["Reports"])

@app.get("/")
def read_root():
    return {"message": "SecureExam AI API is running"}
