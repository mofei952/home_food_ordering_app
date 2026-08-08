import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
import { BottomSheet } from "../../ui/BottomSheet";
import { Chip } from "../../ui/Chip";
import { DishCard } from "../../ui/DishCard";
import { IconPlus } from "../../ui/icons";
import { useToast } from "../../ui/Toast";
import {
  archiveDish,
  createDish,
  listDishes,
  type DishRead,
  updateDish,
} from "./api";
import { DishForm, type DishCategory, type DishInput } from "./DishForm";

type MemberSummary = components["schemas"]["MemberSummary"];

interface DishListPageProps {
  members: MemberSummary[];
}

const CATEGORIES: Array<DishCategory | ""> = [
  "",
  "荤菜",
  "素菜",
  "主食",
  "汤",
  "其他",
];

export function DishListPage({ members }: DishListPageProps) {
  const { push: toast } = useToast();
  const [dishes, setDishes] = useState<DishRead[]>([]);
  const [cookId, setCookId] = useState("");
  const [category, setCategory] = useState<DishCategory | "">("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DishRead | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const result = await listDishes({
          cookId: cookId || undefined,
          category: category || undefined,
        });
        if (!cancelled) setDishes(result);
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : "加载菜品失败",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [cookId, category]);

  const visibleDishes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return dishes;
    return dishes.filter((dish) => dish.name.toLowerCase().includes(q));
  }, [dishes, query]);

  async function reload() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await listDishes({
        cookId: cookId || undefined,
        category: category || undefined,
      });
      setDishes(result);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "加载菜品失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(input: DishInput) {
    await createDish(input);
    setSheetOpen(false);
    toast("菜品已添加");
    await reload();
  }

  async function handleUpdate(input: DishInput) {
    if (!editing) return;
    await updateDish(editing.id, input);
    setEditing(null);
    toast("已保存");
    await reload();
  }

  async function handleArchive(dish: DishRead) {
    const confirmed = window.confirm(`确认归档「${dish.name}」？归档后默认列表不再显示。`);
    if (!confirmed) return;
    try {
      await archiveDish(dish.id);
      toast("已归档");
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "归档失败");
    }
  }

  function openCreate() {
    setEditing(null);
    setSheetOpen(true);
  }

  function openEdit(dish: DishRead) {
    setEditing(dish);
    setSheetOpen(true);
  }

  return (
    <div className="page">
      <div className="search-bar">
        <input
          type="search"
          placeholder="搜索菜名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索菜名"
        />
        <button
          type="button"
          className="btn--ghost"
          onClick={() => setFilterOpen(true)}
        >
          筛选
        </button>
      </div>

      {error ? (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="dish-grid">
          <div className="skeleton" style={{ height: "12rem" }} />
          <div className="skeleton" style={{ height: "12rem" }} />
        </div>
      ) : visibleDishes.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state__title">还没有菜品</p>
          <p>录入几道家常菜，点菜会轻松很多</p>
          <button type="button" onClick={openCreate}>
            新增第一道菜
          </button>
        </div>
      ) : (
        <div className="dish-grid">
          {visibleDishes.map((dish) => (
            <DishCard
              key={dish.id}
              name={dish.name}
              category={dish.category}
              imageUrl={dish.image_url}
              subtitle={`${dish.cooks.map((c) => c.nickname).join("、")}`}
              footer={
                <div className="dish-card__actions">
                  <button type="button" onClick={() => openEdit(dish)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="btn--ghost"
                    data-write="true"
                    onClick={() => void handleArchive(dish)}
                  >
                    归档
                  </button>
                </div>
              }
            />
          ))}
        </div>
      )}

      <button
        type="button"
        className="fab"
        aria-label="新增菜品"
        onClick={openCreate}
      >
        <IconPlus />
      </button>

      <BottomSheet
        open={filterOpen}
        title="筛选"
        onClose={() => setFilterOpen(false)}
      >
        <p className="page__lead">类别</p>
        <div className="chip-row" style={{ marginBottom: "1rem" }}>
          {CATEGORIES.map((item) => (
            <Chip
              key={item || "all"}
              selected={category === item}
              onClick={() => setCategory(item)}
            >
              {item || "全部"}
            </Chip>
          ))}
        </div>
        <p className="page__lead">制作者</p>
        <div className="chip-row">
          <Chip selected={cookId === ""} onClick={() => setCookId("")}>
            全部
          </Chip>
          {members.map((member) => (
            <Chip
              key={member.id}
              selected={cookId === member.id}
              onClick={() => setCookId(member.id)}
            >
              {member.nickname}
            </Chip>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheetOpen}
        title={editing ? "编辑菜品" : "新增菜品"}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
      >
        <DishForm
          members={members}
          initial={
            editing
              ? {
                  name: editing.name,
                  category: editing.category,
                  cookIds: editing.cooks.map((cook) => cook.id),
                  ingredients: editing.ingredients.map((item) => item.name),
                  imageKey: editing.image_key ?? null,
                  imageUrl: editing.image_url,
                }
              : undefined
          }
          onSubmit={editing ? handleUpdate : handleCreate}
          onCancel={() => {
            setSheetOpen(false);
            setEditing(null);
          }}
          submitLabel={editing ? "保存" : "创建"}
        />
      </BottomSheet>
    </div>
  );
}
