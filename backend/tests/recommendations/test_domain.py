import random
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.recommendations.domain import (
    CandidateDish,
    NoCandidatesError,
    choose_weighted,
    match_ingredients,
    recency_weight,
)

CANDIDATES = [
    CandidateDish(id="a", weight=Decimal("1.0")),
    CandidateDish(id="b", weight=Decimal("0.2")),
    CandidateDish(id="c", weight=Decimal("0.5")),
]


@pytest.mark.parametrize(
    ("days_ago", "expected"),
    [
        (None, Decimal("1.0")),
        (2, Decimal("0.2")),
        (5, Decimal("0.5")),
        (10, Decimal("0.8")),
        (20, Decimal("1.0")),
    ],
)
def test_recency_weight(days_ago: int | None, expected: Decimal) -> None:
    today = date(2026, 8, 10)
    eaten = None if days_ago is None else today - timedelta(days=days_ago)
    assert recency_weight(eaten, today) == expected


@pytest.mark.parametrize(
    ("days_ago", "expected"),
    [
        (0, Decimal("0.2")),
        (3, Decimal("0.2")),
        (4, Decimal("0.5")),
        (7, Decimal("0.5")),
        (8, Decimal("0.8")),
        (14, Decimal("0.8")),
        (15, Decimal("1.0")),
    ],
)
def test_recency_weight_boundaries(days_ago: int, expected: Decimal) -> None:
    today = date(2026, 8, 10)
    eaten = today - timedelta(days=days_ago)
    assert recency_weight(eaten, today) == expected


def test_ingredient_match_ready() -> None:
    result = match_ingredients(
        frozenset({"番茄", "鸡蛋"}), frozenset({"番茄", "鸡蛋", "葱"})
    )
    assert result.visibility == "ready"
    assert result.missing == frozenset()


def test_ingredient_match_one_missing() -> None:
    result = match_ingredients(frozenset({"番茄", "鸡蛋"}), frozenset({"番茄"}))
    assert result.visibility == "one_missing"
    assert result.missing == frozenset({"鸡蛋"})


def test_ingredient_match_hides_two_missing() -> None:
    result = match_ingredients(
        frozenset({"番茄", "鸡蛋", "牛肉"}), frozenset({"番茄"})
    )
    assert result.visibility == "hidden"
    assert result.missing == frozenset({"鸡蛋", "牛肉"})


def test_ingredient_match_empty_required_is_ready() -> None:
    """Dishes with no required ingredients are always ready."""
    empty = match_ingredients(frozenset(), frozenset())
    assert empty.visibility == "ready"
    assert empty.missing == frozenset()

    with_available = match_ingredients(frozenset(), frozenset({"番茄"}))
    assert with_available.visibility == "ready"
    assert with_available.missing == frozenset()


def test_recency_weight_future_last_eaten_uses_recent_bucket() -> None:
    """Negative day deltas (clock skew / TZ) stay in the most recent bucket."""
    today = date(2026, 8, 10)
    assert recency_weight(today + timedelta(days=1), today) == Decimal("0.2")


def test_weighted_choice_is_repeatable() -> None:
    first = choose_weighted(CANDIDATES, random.Random(42))
    second = choose_weighted(CANDIDATES, random.Random(42))
    assert first.id == second.id


def test_weighted_choice_empty_raises() -> None:
    with pytest.raises(NoCandidatesError):
        choose_weighted([], random.Random(1))


def test_weighted_choice_single_candidate() -> None:
    only = CandidateDish(id="solo", weight=Decimal("0.01"))
    assert choose_weighted([only], random.Random(0)).id == "solo"
