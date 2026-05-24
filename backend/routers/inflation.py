from fastapi import APIRouter
from services.inflation import get_inflation

router = APIRouter(prefix="/inflation", tags=["inflation"])


@router.get("/current")
def current_inflation():
    """Return the current US CPI-U year-over-year inflation rate (cached 24 h)."""
    return get_inflation()
