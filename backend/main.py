from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database import init_db, engine
from routers import tickers, alerts, dividends, retirement
from services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    start_scheduler(engine)
    yield
    stop_scheduler()


app = FastAPI(title="Stock Alert Tracker", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tickers.router)
app.include_router(alerts.router)
app.include_router(dividends.router)
app.include_router(retirement.router)


@app.get("/health")
def health():
    return {"status": "ok"}
