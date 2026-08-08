import unicodedata
from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.models import utc_now
from app.dishes.models import (
    Dish,
    DishCook,
    DishIngredient,
    Ingredient,
    IngredientAlias,
)
from app.dishes.schemas import (
    CookSummary,
    DishCreate,
    DishRead,
    DishUpdate,
    IngredientCreate,
    IngredientRead,
    IngredientSummary,
    UpdatedBySummary,
)
from app.errors import ApiError
from app.households.models import Member
from app.households.service import AuthContext
from app.images.service import signed_image_url
from app.images.storage import Storage


def normalize_ingredient_name(value: str) -> str:
    return unicodedata.normalize("NFKC", value).strip().casefold()


def dish_to_read(dish: Dish, storage: Storage | None = None) -> DishRead:
    cooks = [
        CookSummary.model_validate(link.member)
        for link in sorted(dish.cooks, key=lambda item: item.member.nickname)
    ]
    ingredients = [
        IngredientSummary.model_validate(link.ingredient)
        for link in sorted(
            dish.ingredients, key=lambda item: item.ingredient.name
        )
    ]
    image_url = (
        signed_image_url(storage, dish.image_key) if storage is not None else None
    )
    return DishRead(
        id=dish.id,
        name=dish.name,
        category=dish.category,
        cooks=cooks,
        ingredients=ingredients,
        image_key=dish.image_key,
        image_url=image_url,
        archived_at=dish.archived_at,
        updated_by=UpdatedBySummary.model_validate(dish.updated_by),
        updated_at=dish.updated_at,
    )


def validate_image_key(auth: AuthContext, image_key: str | None) -> None:
    if image_key is None:
        return
    prefix = f"{auth.household.id}/"
    if not image_key.startswith(prefix) or image_key == prefix:
        raise ApiError(400, "图片无效", "invalid_image_key")


def ingredient_to_read(ingredient: Ingredient) -> IngredientRead:
    return IngredientRead(
        id=ingredient.id,
        name=ingredient.name,
        aliases=[alias.name for alias in ingredient.aliases],
    )


async def load_dish(
    db: AsyncSession, household_id: UUID, dish_id: UUID
) -> Dish | None:
    return await db.scalar(
        select(Dish)
        .where(Dish.id == dish_id, Dish.household_id == household_id)
        .options(
            selectinload(Dish.cooks).selectinload(DishCook.member),
            selectinload(Dish.ingredients).selectinload(DishIngredient.ingredient),
            selectinload(Dish.updated_by),
        )
        .execution_options(populate_existing=True)
    )


async def require_dish(
    db: AsyncSession, household_id: UUID, dish_id: UUID
) -> Dish:
    dish = await load_dish(db, household_id, dish_id)
    if dish is None:
        raise ApiError(404, "菜品不存在", "dish_not_found")
    return dish


async def resolve_cooks(
    db: AsyncSession, auth: AuthContext, cook_ids: Sequence[UUID]
) -> list[Member]:
    members = list(
        await db.scalars(
            select(Member).where(
                Member.id.in_(list(cook_ids)),
                Member.household_id == auth.household.id,
            )
        )
    )
    found = {member.id for member in members}
    missing = [cook_id for cook_id in cook_ids if cook_id not in found]
    if missing:
        raise ApiError(404, "成员不存在", "member_not_found")
    by_id = {member.id: member for member in members}
    return [by_id[cook_id] for cook_id in cook_ids]


async def find_ingredient_by_normalized(
    db: AsyncSession, household_id: UUID, normalized: str
) -> Ingredient | None:
    ingredient = await db.scalar(
        select(Ingredient)
        .where(
            Ingredient.household_id == household_id,
            Ingredient.normalized_name == normalized,
        )
        .options(selectinload(Ingredient.aliases))
    )
    if ingredient is not None:
        return ingredient

    alias = await db.scalar(
        select(IngredientAlias)
        .where(
            IngredientAlias.household_id == household_id,
            IngredientAlias.normalized_name == normalized,
        )
        .options(
            selectinload(IngredientAlias.ingredient).selectinload(
                Ingredient.aliases
            )
        )
    )
    if alias is None:
        return None
    return alias.ingredient


async def get_or_create_ingredient(
    db: AsyncSession, auth: AuthContext, name: str
) -> Ingredient:
    normalized = normalize_ingredient_name(name)
    existing = await find_ingredient_by_normalized(
        db, auth.household.id, normalized
    )
    if existing is not None:
        return existing

    ingredient = Ingredient(
        household_id=auth.household.id,
        name=name.strip(),
        normalized_name=normalized,
        created_by_id=auth.member.id,
    )
    db.add(ingredient)
    await db.flush()
    await db.refresh(ingredient, attribute_names=["aliases"])
    return ingredient


async def create_canonical_ingredient(
    db: AsyncSession, auth: AuthContext, payload: IngredientCreate
) -> Ingredient:
    normalized = normalize_ingredient_name(payload.name)
    existing = await find_ingredient_by_normalized(
        db, auth.household.id, normalized
    )
    if existing is not None:
        raise ApiError(409, "食材已存在", "ingredient_exists")

    for alias_name in payload.aliases:
        alias_normalized = normalize_ingredient_name(alias_name)
        if alias_normalized == normalized:
            raise ApiError(400, "同义词不能与规范名相同", "alias_matches_name")
        conflict = await find_ingredient_by_normalized(
            db, auth.household.id, alias_normalized
        )
        if conflict is not None:
            raise ApiError(409, "同义词已被占用", "alias_exists")

    ingredient = Ingredient(
        household_id=auth.household.id,
        name=payload.name.strip(),
        normalized_name=normalized,
        created_by_id=auth.member.id,
    )
    db.add(ingredient)
    await db.flush()

    for alias_name in payload.aliases:
        db.add(
            IngredientAlias(
                household_id=auth.household.id,
                ingredient_id=ingredient.id,
                name=alias_name.strip(),
                normalized_name=normalize_ingredient_name(alias_name),
                created_by_id=auth.member.id,
            )
        )
    await db.commit()
    loaded = await find_ingredient_by_normalized(
        db, auth.household.id, normalized
    )
    assert loaded is not None
    return loaded


async def search_ingredients(
    db: AsyncSession, auth: AuthContext, query: str | None
) -> list[Ingredient]:
    stmt = (
        select(Ingredient)
        .where(Ingredient.household_id == auth.household.id)
        .options(selectinload(Ingredient.aliases))
        .order_by(Ingredient.name, Ingredient.id)
    )
    if query:
        normalized = normalize_ingredient_name(query)
        alias_ids = select(IngredientAlias.ingredient_id).where(
            IngredientAlias.household_id == auth.household.id,
            IngredientAlias.normalized_name == normalized,
        )
        stmt = stmt.where(
            or_(
                Ingredient.normalized_name == normalized,
                Ingredient.id.in_(alias_ids),
                Ingredient.name.contains(query.strip()),
            )
        )
    return list(await db.scalars(stmt))


async def apply_dish_relations(
    db: AsyncSession,
    auth: AuthContext,
    dish: Dish,
    *,
    cook_ids: Sequence[UUID],
    ingredient_names: Sequence[str],
) -> None:
    cooks = await resolve_cooks(db, auth, cook_ids)

    await db.execute(delete(DishCook).where(DishCook.dish_id == dish.id))
    await db.execute(
        delete(DishIngredient).where(DishIngredient.dish_id == dish.id)
    )

    for member in cooks:
        db.add(DishCook(dish_id=dish.id, member_id=member.id))

    seen: set[UUID] = set()
    for name in ingredient_names:
        ingredient = await get_or_create_ingredient(db, auth, name)
        if ingredient.id in seen:
            continue
        seen.add(ingredient.id)
        db.add(
            DishIngredient(dish_id=dish.id, ingredient_id=ingredient.id)
        )


async def create_dish(
    db: AsyncSession, auth: AuthContext, payload: DishCreate
) -> Dish:
    validate_image_key(auth, payload.image_key)
    dish = Dish(
        household_id=auth.household.id,
        name=payload.name,
        category=payload.category,
        image_key=payload.image_key,
        created_by_id=auth.member.id,
        updated_by_id=auth.member.id,
        updated_at=utc_now(),
    )
    db.add(dish)
    await db.flush()
    await apply_dish_relations(
        db,
        auth,
        dish,
        cook_ids=payload.cook_ids,
        ingredient_names=payload.ingredients,
    )
    await db.commit()
    return await require_dish(db, auth.household.id, dish.id)


async def update_dish(
    db: AsyncSession, auth: AuthContext, dish_id: UUID, payload: DishUpdate
) -> Dish:
    dish = await require_dish(db, auth.household.id, dish_id)
    if dish.archived_at is not None:
        raise ApiError(400, "已归档菜品不可编辑", "dish_archived")

    validate_image_key(auth, payload.image_key)
    dish.name = payload.name
    dish.category = payload.category
    dish.image_key = payload.image_key
    dish.updated_by_id = auth.member.id
    dish.updated_at = utc_now()
    await apply_dish_relations(
        db,
        auth,
        dish,
        cook_ids=payload.cook_ids,
        ingredient_names=payload.ingredients,
    )
    await db.commit()
    return await require_dish(db, auth.household.id, dish.id)


async def archive_dish(
    db: AsyncSession, auth: AuthContext, dish_id: UUID
) -> Dish:
    dish = await require_dish(db, auth.household.id, dish_id)
    if dish.archived_at is None:
        dish.archived_at = utc_now()
        dish.updated_by_id = auth.member.id
        dish.updated_at = utc_now()
        await db.commit()
    return await require_dish(db, auth.household.id, dish.id)


async def list_dishes(
    db: AsyncSession,
    auth: AuthContext,
    *,
    cook_id: UUID | None = None,
    category: str | None = None,
    include_archived: bool = False,
) -> list[Dish]:
    stmt = (
        select(Dish)
        .where(Dish.household_id == auth.household.id)
        .options(
            selectinload(Dish.cooks).selectinload(DishCook.member),
            selectinload(Dish.ingredients).selectinload(DishIngredient.ingredient),
            selectinload(Dish.updated_by),
        )
        .order_by(Dish.updated_at.desc(), Dish.id)
    )
    if not include_archived:
        stmt = stmt.where(Dish.archived_at.is_(None))
    if category is not None:
        stmt = stmt.where(Dish.category == category)
    if cook_id is not None:
        stmt = stmt.where(
            Dish.id.in_(
                select(DishCook.dish_id).where(DishCook.member_id == cook_id)
            )
        )
    return list(await db.scalars(stmt))
