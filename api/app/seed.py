import json
import os
from collections.abc import Generator
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Monster, MonsterType, Source

# Reserved names here are a first-pass safety gate and can be expanded over time.
BLOCKED_NAMES = {
    "beholder",
    "displacer beast",
    "carrion crawler",
    "intellect devourer",
    "githyanki",
    "githzerai",
    "mind flayer",
    "otyugh",
    "slaad",
    "thri-kreen",
    "umber hulk",
    "umber hulk",
    "xorn",
    "yuan-ti",
}

OPEN5E_ENDPOINT = "https://api.open5e.com/v1/monsters/?limit=100"
MIN_TARGET_MONSTERS = 400
CACHE_FILE = Path(__file__).parent / "data" / "open5e_cache.json"


def _classic_type(raw_type: str) -> str:
    value = (raw_type or "").strip().lower()
    mapping = {
        "aberration": "Monstrous",
        "beast": "Beast",
        "celestial": "Monstrous",
        "construct": "Construct",
        "dragon": "Dragon",
        "elemental": "Elemental",
        "fey": "Monstrous",
        "fiend": "Monstrous",
        "giant": "Giant",
        "humanoid": "Humanoid",
        "monstrosity": "Monstrous",
        "ooze": "Ooze",
        "plant": "Plant",
        "undead": "Undead",
    }
    return mapping.get(value, "Monstrous")


def _short_actions(entry: dict) -> str:
    actions = entry.get("actions")

    if isinstance(actions, str):
        cleaned = actions.strip()
        if not cleaned:
            return "Special"
        return cleaned.split("\n", 1)[0][:120]

    if isinstance(actions, list) and actions:
        first = actions[0]
        if isinstance(first, dict):
            name = str(first.get("name") or "").strip()
            desc = str(first.get("desc") or "").strip()
            text = ": ".join(part for part in [name, desc] if part)
            return (text or "Special")[:120]
        return str(first)[:120]

    return "Special"


def _speed_text(speed_value: object) -> str:
    if isinstance(speed_value, dict):
        chunks = [f"{k} {v}" for k, v in speed_value.items()]
        return ", ".join(chunks)[:64]
    if isinstance(speed_value, str) and speed_value.strip():
        return speed_value[:64]
    return "30 ft"


def _source_payload_from_open5e(entry: dict) -> dict:
    doc_title = entry.get("document__title") or "Open5e"
    slug = entry.get("document__slug") or "open5e"
    doc_url = entry.get("document__url")
    if not doc_url:
        doc_url = f"https://open5e.com/{slug}"

    return {
        "key": f"open5e-{slug}",
        "name": doc_title,
        "source_url": doc_url,
        "license": "Open Gaming License content via Open5e",
        "attribution": "Monster data sourced from Open5e open content endpoint.",
    }


def _monster_payload_from_open5e(entry: dict) -> dict:
    desc = (entry.get("desc") or "").replace("\n", " ").strip()
    if not desc:
        desc = "Open-licensed fantasy creature entry."
    return {
        "name": (entry.get("name") or "").strip(),
        "type": _classic_type(entry.get("type") or ""),
        "source_key": _source_payload_from_open5e(entry)["key"],
        "armor_class": str(entry.get("armor_class") or "10"),
        "hit_dice": str(entry.get("hit_dice") or entry.get("challenge_rating") or "1"),
        "attacks": _short_actions(entry),
        "movement": _speed_text(entry.get("speed")),
        "morale": "-",
        "alignment": str(entry.get("alignment") or "Neutral")[:32],
        "summary": desc[:320],
    }


def _fetch_json(url: str) -> dict:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; DnDBookImporter/1.0; +https://localhost)",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=20) as response:  # noqa: S310 - controlled URL constant
        return json.loads(response.read().decode("utf-8"))


def _iter_open5e_monsters() -> Generator[dict, None, None]:
    next_url = OPEN5E_ENDPOINT
    while next_url:
        payload = _fetch_json(next_url)
        for item in payload.get("results", []):
            yield item
        next_url = payload.get("next")


def _iter_cached_open5e_monsters() -> Generator[dict, None, None]:
    if not CACHE_FILE.exists():
        return
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        payload = json.load(f)
    for item in payload.get("results", []):
        yield item


def _open5e_available() -> bool:
    parsed = urlparse(OPEN5E_ENDPOINT)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _load_seed_payload() -> dict:
    seed_path = os.getenv("SEED_FILE", str(Path(__file__).parent / "data" / "monsters_seed.json"))
    with open(seed_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _upsert_type(db: Session, name: str) -> MonsterType:
    item = db.execute(select(MonsterType).where(MonsterType.name == name)).scalar_one_or_none()
    if item:
        return item
    item = MonsterType(name=name)
    db.add(item)
    db.flush()
    return item


def _upsert_source(db: Session, payload: dict) -> Source:
    item = db.execute(select(Source).where(Source.name == payload["name"])).scalar_one_or_none()
    if item:
        item.source_url = payload.get("source_url") or item.source_url
        item.license = payload["license"]
        item.attribution = payload["attribution"]
        db.flush()
        return item

    item = Source(
        name=payload["name"],
        source_url=payload.get("source_url", ""),
        license=payload["license"],
        attribution=payload["attribution"],
    )
    db.add(item)
    db.flush()
    return item


def _name_is_allowed(name: str) -> bool:
    return name.strip().lower() not in BLOCKED_NAMES


def seed_database(db: Session) -> None:
    payload = _load_seed_payload()

    source_map: dict[str, Source] = {}
    for src in payload["sources"]:
        src.setdefault("source_url", "")
        source_map[src["key"]] = _upsert_source(db, src)

    type_map: dict[str, MonsterType] = {}
    for type_name in payload["types"]:
        type_map[type_name] = _upsert_type(db, type_name)

    for item in payload["monsters"]:
        if not _name_is_allowed(item["name"]):
            continue

        existing = db.execute(
            select(Monster).where(
                Monster.name == item["name"],
                Monster.type_id == type_map[item["type"]].id,
            )
        ).scalar_one_or_none()
        if existing:
            continue

        db.add(
            Monster(
                name=item["name"],
                type_id=type_map[item["type"]].id,
                source_id=source_map[item["source_key"]].id,
                armor_class=item["armor_class"],
                hit_dice=item["hit_dice"],
                attacks=item["attacks"],
                movement=item["movement"],
                morale=item["morale"],
                alignment=item["alignment"],
                summary=item["summary"],
                legal_safe=True,
            )
        )

    db.commit()

    current_total = db.execute(select(func.count()).select_from(Monster)).scalar_one()
    if current_total >= MIN_TARGET_MONSTERS:
        return

    try:
        for remote_entry in _iter_cached_open5e_monsters():
            normalized = _monster_payload_from_open5e(remote_entry)
            if not normalized["name"] or not _name_is_allowed(normalized["name"]):
                continue

            source_info = _source_payload_from_open5e(remote_entry)
            source_map[source_info["key"]] = _upsert_source(db, source_info)
            if normalized["type"] not in type_map:
                type_map[normalized["type"]] = _upsert_type(db, normalized["type"])

            existing = db.execute(
                select(Monster).where(
                    Monster.name == normalized["name"],
                    Monster.type_id == type_map[normalized["type"]].id,
                )
            ).scalar_one_or_none()
            if existing:
                continue

            db.add(
                Monster(
                    name=normalized["name"],
                    type_id=type_map[normalized["type"]].id,
                    source_id=source_map[normalized["source_key"]].id,
                    armor_class=normalized["armor_class"],
                    hit_dice=normalized["hit_dice"],
                    attacks=normalized["attacks"],
                    movement=normalized["movement"],
                    morale=normalized["morale"],
                    alignment=normalized["alignment"],
                    summary=normalized["summary"],
                    legal_safe=True,
                )
            )

        db.commit()
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        db.rollback()

    current_total = db.execute(select(func.count()).select_from(Monster)).scalar_one()
    if current_total >= MIN_TARGET_MONSTERS or not _open5e_available():
        return

    try:
        for remote_entry in _iter_open5e_monsters():
            normalized = _monster_payload_from_open5e(remote_entry)
            if not normalized["name"] or not _name_is_allowed(normalized["name"]):
                continue

            source_info = _source_payload_from_open5e(remote_entry)
            source_map[source_info["key"]] = _upsert_source(db, source_info)
            if normalized["type"] not in type_map:
                type_map[normalized["type"]] = _upsert_type(db, normalized["type"])

            existing = db.execute(
                select(Monster).where(
                    Monster.name == normalized["name"],
                    Monster.type_id == type_map[normalized["type"]].id,
                )
            ).scalar_one_or_none()
            if existing:
                continue

            db.add(
                Monster(
                    name=normalized["name"],
                    type_id=type_map[normalized["type"]].id,
                    source_id=source_map[normalized["source_key"]].id,
                    armor_class=normalized["armor_class"],
                    hit_dice=normalized["hit_dice"],
                    attacks=normalized["attacks"],
                    movement=normalized["movement"],
                    morale=normalized["morale"],
                    alignment=normalized["alignment"],
                    summary=normalized["summary"],
                    legal_safe=True,
                )
            )

        db.commit()
    except (URLError, TimeoutError, OSError):
        db.rollback()
