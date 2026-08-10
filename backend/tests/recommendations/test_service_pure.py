"""Pure unit tests for recommendation service helpers (no DB)."""

from uuid import uuid4

from app.recommendations.schemas import RecommendationFilters
from app.recommendations.service import no_candidates_error, relaxable_filter_keys


def test_relaxable_filter_keys_empty_when_no_filters() -> None:
    assert relaxable_filter_keys(RecommendationFilters()) == []


def test_relaxable_filter_keys_lists_active_filters_in_order() -> None:
    filters = RecommendationFilters(
        cook_ids=[uuid4()],
        categories=["荤菜"],
        available_ingredient_ids=[uuid4()],
    )
    assert relaxable_filter_keys(filters) == [
        "cook_ids",
        "categories",
        "available_ingredient_ids",
    ]


def test_no_candidates_error_empty_catalog_message() -> None:
    error = no_candidates_error(RecommendationFilters())
    assert error.status_code == 404
    assert error.code == "no_candidates"
    assert "菜品库为空" in error.detail
    assert error.relaxable_filters == []


def test_no_candidates_error_lists_relaxable_labels() -> None:
    error = no_candidates_error(
        RecommendationFilters(categories=["汤"], cook_ids=[uuid4()])
    )
    assert "制作者" in error.detail
    assert "类别" in error.detail
    assert "食材" not in error.detail
    assert error.relaxable_filters == ["cook_ids", "categories"]
