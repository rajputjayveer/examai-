import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: str = "3306"
    DB_USER: str = "root"
    DB_PASSWORD: str
    DB_NAME: str = "examguard"
    DATABASE_URL: str = "mysql+pymysql://root:@localhost:3306/examguard"
    JWT_SECRET: str
    JWT_EXPIRE_MINUTES: int = 480  # 8 hours — covers a full exam day without token expiry
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "your_email@gmail.com"
    SMTP_PASSWORD: str = ""
    DEV_MODE: bool = False
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str
    FRONTEND_BASE_URL: str = "http://localhost:3000"




    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
        extra = "ignore"


settings = Settings()
