from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class MonsterType(Base):
    __tablename__ = "monster_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    monsters: Mapped[list["Monster"]] = relationship(back_populates="monster_type")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    source_url: Mapped[str] = mapped_column(Text, nullable=False)
    license: Mapped[str] = mapped_column(String(128), nullable=False)
    attribution: Mapped[str] = mapped_column(Text, nullable=False)

    monsters: Mapped[list["Monster"]] = relationship(back_populates="source")


class Monster(Base):
    __tablename__ = "monsters"
    __table_args__ = (UniqueConstraint("name", "type_id", name="uq_monster_name_type"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    type_id: Mapped[int] = mapped_column(ForeignKey("monster_types.id"), nullable=False, index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("sources.id"), nullable=False, index=True)

    armor_class: Mapped[str] = mapped_column(String(32), nullable=False)
    hit_dice: Mapped[str] = mapped_column(String(32), nullable=False)
    attacks: Mapped[str] = mapped_column(String(128), nullable=False)
    movement: Mapped[str] = mapped_column(String(64), nullable=False)
    morale: Mapped[str] = mapped_column(String(16), nullable=False)
    alignment: Mapped[str] = mapped_column(String(32), nullable=False)

    summary: Mapped[str] = mapped_column(Text, nullable=False)
    legal_safe: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    monster_type: Mapped[MonsterType] = relationship(back_populates="monsters")
    source: Mapped[Source] = relationship(back_populates="monsters")
