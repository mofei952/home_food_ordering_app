from __future__ import annotations

import random
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

Visibility = Literal["ready", "one_missing", "hidden"]


class NoCandidatesError(Exception):
    """Raised when filtering leaves no dishes to recommend."""


@dataclass(frozen=True)
class IngredientMatch:
    visibility: Visibility
    missing: frozenset[str]


@dataclass(frozen=True)
class CandidateDish:
    id: str
    weight: Decimal


def match_ingredients(
    required: frozenset[str], available: frozenset[str]
) -> IngredientMatch:
    missing = required - available
    count = len(missing)
    if count == 0:
        visibility: Visibility = "ready"
    elif count == 1:
        visibility = "one_missing"
    else:
        visibility = "hidden"
    return IngredientMatch(visibility=visibility, missing=missing)


def recency_weight(last_eaten_on: date | None, today: date) -> Decimal:
    if last_eaten_on is None:
        return Decimal("1.0")
    days = (today - last_eaten_on).days
    if days <= 3:
        return Decimal("0.2")
    if days <= 7:
        return Decimal("0.5")
    if days <= 14:
        return Decimal("0.8")
    return Decimal("1.0")


def choose_weighted(
    candidates: Sequence[CandidateDish], rng: random.Random
) -> CandidateDish:
    if not candidates:
        raise NoCandidatesError()
    weights = [float(candidate.weight) for candidate in candidates]
    return rng.choices(list(candidates), weights=weights, k=1)[0]
