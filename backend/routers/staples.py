from fastapi import APIRouter
from services.staples import get_staple_prices

router = APIRouter(prefix="/staples", tags=["staples"])


@router.get("/prices")
def staple_prices():
    """Return the latest BLS average retail prices for common consumer staples."""
    return get_staple_prices()
