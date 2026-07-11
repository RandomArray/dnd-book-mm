from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text

from .database import Base, SessionLocal, engine
from .models import Monster, MonsterType, Source
from .seed import seed_database

app = FastAPI(title="Basic-Era Monster Manual API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_url TEXT NOT NULL DEFAULT ''")
        )
    with SessionLocal() as db:
        seed_database(db)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/monster-types")
def monster_types() -> list[dict[str, str]]:
    with SessionLocal() as db:
        rows = db.execute(select(MonsterType.name).order_by(MonsterType.name.asc())).all()
    return [{"name": row[0]} for row in rows]


@app.get("/monsters")
def list_monsters(
    monster_type: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> list[dict]:
    with SessionLocal() as db:
        numbering = func.row_number().over(
            partition_by=MonsterType.name,
            order_by=Monster.name.asc(),
        )

        stmt = (
            select(
                Monster.id,
                Monster.name,
                MonsterType.name.label("type"),
                Source.name.label("source"),
                Source.source_url.label("source_url"),
                Monster.armor_class,
                Monster.hit_dice,
                Monster.attacks,
                Monster.movement,
                Monster.morale,
                Monster.alignment,
                Monster.summary,
                numbering.label("group_number"),
            )
            .join(MonsterType, Monster.type_id == MonsterType.id)
            .join(Source, Monster.source_id == Source.id)
            .where(Monster.legal_safe.is_(True))
            .order_by(MonsterType.name.asc(), Monster.name.asc())
        )

        if monster_type:
            stmt = stmt.where(func.lower(MonsterType.name) == monster_type.lower())

        if search:
            term = f"%{search}%"
            stmt = stmt.where(Monster.name.ilike(term))

        rows = db.execute(stmt).all()

    return [
        {
            "id": row.id,
            "name": row.name,
            "type": row.type,
            "source": row.source,
            "sourceUrl": row.source_url,
            "stats": {
                "ac": row.armor_class,
                "hd": row.hit_dice,
                "attacks": row.attacks,
                "movement": row.movement,
                "morale": row.morale,
                "alignment": row.alignment,
            },
            "summary": row.summary,
            "groupNumber": row.group_number,
        }
        for row in rows
    ]
