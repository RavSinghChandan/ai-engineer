"""API v1 router aggregation."""
from fastapi import APIRouter

from app.api.v1 import agents, auth, files, jobs, profiles, projects, prompts

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(jobs.router)
api_router.include_router(agents.router)
api_router.include_router(prompts.router)
api_router.include_router(profiles.router)
api_router.include_router(files.router)
