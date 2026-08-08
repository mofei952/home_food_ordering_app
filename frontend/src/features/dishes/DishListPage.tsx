import { useEffect, useState } from "react";

import { ApiError } from "../../api/client";
import type { components } from "../../api/generated";
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
  const [dishes, setDishes] = useState<DishRead[]>([]);
  const [cookId, setCookId] = useState("");
  const [category, setCategory] = useState<DishCategory | "">("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DishRead | null>(null);
  const [creating, setCreating] = useState(false);

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
    setCreating(false);
    await reload();
  }

  async function handleUpdate(input: DishInput) {
    if (!editing) return;
    await updateDish(editing.id, input);
    setEditing(null);
    await reload();
  }

  async function handleArchive(dish: DishRead) {
    const confirmed = window.confirm(`确认归档「${dish.name}」？归档后默认列表不再显示。`);
    if (!confirmed) return;
    try {
      await archiveDish(dish.id);
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "归档失败");
    }
  }

  if (creating) {
    return (
      <section>
        <h2>新增菜品</h2>
        <DishForm
          members={members}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
          submitLabel="创建"
        />
      </section>
    );
  }

  if (editing) {
    return (
      <section>
        <h2>编辑菜品</h2>
        <DishForm
          members={members}
          initial={{
            name: editing.name,
            category: editing.category,
            cookIds: editing.cooks.map((cook) => cook.id),
            ingredients: editing.ingredients.map((item) => item.name),
            imageKey: editing.image_key ?? null,
            imageUrl: editing.image_url,
          }}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      </section>
    );
  }

  return (
    <section>
      <h2>菜品</h2>
      {error && <p role="alert">{error}</p>}
      <div>
        <label>
          类别
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as DishCategory | "")
            }
          >
            <option value="">全部类别</option>
            {CATEGORIES.filter(Boolean).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          制作者
          <select
            value={cookId}
            onChange={(event) => setCookId(event.target.value)}
          >
            <option value="">全部制作者</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nickname}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setCreating(true)}>
          新增菜品
        </button>
      </div>

      {loading ? (
        <p>正在加载…</p>
      ) : dishes.length === 0 ? (
        <p>还没有菜品，先录入几道家常菜吧。</p>
      ) : (
        <ul>
          {dishes.map((dish) => (
            <li key={dish.id}>
              <article>
                <h3>{dish.name}</h3>
                <p>{dish.category}</p>
                <p>制作者：{dish.cooks.map((cook) => cook.nickname).join("、")}</p>
                <p>
                  食材：{dish.ingredients.map((item) => item.name).join("、")}
                </p>
                <button type="button" onClick={() => setEditing(dish)}>
                  编辑
                </button>
                <button type="button" onClick={() => void handleArchive(dish)}>
                  归档
                </button>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
