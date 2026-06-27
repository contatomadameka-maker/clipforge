# ─────────────────────────────────────────────────────────────
# backend/models/schemas.py
# Schemas Pydantic — validação de entrada e saída da API
# ─────────────────────────────────────────────────────────────

from pydantic import BaseModel, EmailStr
from typing import Optional, Literal
from datetime import datetime
import uuid


# ── Auth ──────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    user_id: str
    email: str
    name: str
    plan: str


# ── Perfil ────────────────────────────────────────────────────

class ProfileResponse(BaseModel):
    id: str
    name: str
    email: str
    plan: str
    created_at: datetime


# ── Créditos ──────────────────────────────────────────────────

class CreditBalanceResponse(BaseModel):
    user_id: str
    balance: int
    updated_at: datetime


class CreditTransactionResponse(BaseModel):
    id: str
    user_id: str
    amount: int
    type: str
    description: str
    created_at: datetime


# ── Studio ────────────────────────────────────────────────────

class StudioCreateRequest(BaseModel):
    topic: str
    duration_minutes: Literal[5, 8, 12, 15]
    style: Literal["documentary", "biblical", "motivational", "narrative"]
    voice_id: str = "male-deep"
    language: str = "pt-BR"


class StudioProjectResponse(BaseModel):
    id: str
    user_id: str
    topic: str
    duration_minutes: int
    style: str
    voice_id: str
    language: str
    status: str
    current_agent: Optional[int]
    progress: int
    video_url: Optional[str]
    thumbnail_url: Optional[str]
    seo_data: Optional[dict]
    credits_used: Optional[int]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


class StudioProgressResponse(BaseModel):
    project_id: str
    status: str
    current_agent: int        # 1 a 9
    current_agent_name: str
    progress: int             # 0–100
    message: str


# ── TikTok ────────────────────────────────────────────────────

class TikTokCreateRequest(BaseModel):
    title: str
    template: Optional[str] = None
    blocks: dict              # estado dos 4 blocos serializado


class VideoProjectResponse(BaseModel):
    id: str
    user_id: str
    title: str
    status: str
    blocks: dict
    created_at: datetime
    updated_at: datetime


class GenerateVideoRequest(BaseModel):
    project_id: str
    format: Literal["9:16", "1:1", "16:9"] = "9:16"
    duration_seconds: Literal[15, 30, 45, 60] = 30
    caption: bool = True
    music: bool = True


class GeneratedVideoResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    status: str
    credits_used: Optional[int]
    video_url: Optional[str]
    thumbnail_url: Optional[str]
    duration_seconds: Optional[int]
    format: str
    job_id: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    completed_at: Optional[datetime]


# ── Genérico ──────────────────────────────────────────────────

class MessageResponse(BaseModel):
    message: str


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
