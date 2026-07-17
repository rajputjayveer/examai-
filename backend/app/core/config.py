import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: str = "3306"
    DB_USER: str = "root"
    DB_PASSWORD: str = "#rajputjayveer"
    DB_NAME: str = "examguard"
    DATABASE_URL: str = "mysql+pymysql://DB_USER:DB_PASSWORD@localhost:3306/examguard"
    JWT_SECRET: str = "change-me-to-a-very-secure-secret-key-32-chars-long"

    JWT_EXPIRE_MINUTES: int = 60
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = "your_email@gmail.com"
    SMTP_PASSWORD: str = ""
    DEV_MODE: bool = True
    GEMINI_API_KEY: str = ""
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "secure-admin-password"



    class Config:
        env_file = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env")
        extra = "ignore"


settings = Settings()
