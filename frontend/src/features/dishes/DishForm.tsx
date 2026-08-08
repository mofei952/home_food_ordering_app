import { FormEvent, useState } from "react";

import type { components } from "../../api/generated";
import { ImageField } from "../images/ImageField";

export type DishCategory = "荤菜" | "素菜" | "主食" | "汤" | "其他";

export type DishInput = {
  name: string;
  category: DishCategory;
  cookIds: string[];
  ingredients: string[];
  imageKey: string | null;
};

type MemberSummary = components["schemas"]["MemberSummary"];

const CATEGORIES: DishCategory[] = ["荤菜", "素菜", "主食", "汤", "其他"];

interface DishFormProps {
  members: MemberSummary[];
  initial?: Partial<DishInput> & { imageUrl?: string | null };
  submitLabel?: string;
  onSubmit: (input: DishInput) => void | Promise<void>;
  onCancel: () => void;
}

function parseIngredients(value: string): string[] {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DishForm({
  members,
  initial,
  submitLabel = "保存",
  onSubmit,
  onCancel,
}: DishFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<DishCategory | "">(
    initial?.category ?? "",
  );
  const [cookIds, setCookIds] = useState<string[]>(initial?.cookIds ?? []);
  const [ingredientsText, setIngredientsText] = useState(
    (initial?.ingredients ?? []).join("，"),
  );
  const [imageKey, setImageKey] = useState<string | null>(
    initial?.imageKey ?? null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    initial?.imageUrl ?? null,
  );
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function toggleCook(memberId: string) {
    setCookIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    const ingredients = parseIngredients(ingredientsText);
    if (!name.trim()) {
      setError("请填写菜名");
      return;
    }
    if (!category) {
      setError("请选择类别");
      return;
    }
    if (cookIds.length === 0) {
      setError("请选择至少一位制作者");
      return;
    }
    if (ingredients.length === 0) {
      setError("请填写至少一种食材");
      return;
    }

    const payload: DishInput = {
      name: name.trim(),
      category,
      cookIds,
      ingredients,
      // imageKey is cleared only via ImageField clear; failed re-upload keeps prior key.
      imageKey,
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form aria-label="菜品表单" className="form-stack" onSubmit={handleSubmit}>
      {error && (
        <p className="alert-inline" role="alert">
          {error}
        </p>
      )}
      <label>
        菜名
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label>
        类别
        <select
          name="category"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as DishCategory | "")
          }
          required
        >
          <option value="">请选择</option>
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>制作者</legend>
        {members
          .filter((member) => member.status === "active")
          .map((member) => (
            <label key={member.id}>
              <input
                type="checkbox"
                checked={cookIds.includes(member.id)}
                onChange={() => toggleCook(member.id)}
              />
              {member.nickname}
            </label>
          ))}
      </fieldset>
      <label>
        食材
        <input
          name="ingredients"
          value={ingredientsText}
          onChange={(event) => setIngredientsText(event.target.value)}
          placeholder="用逗号分隔，例如：番茄，鸡蛋"
          required
        />
      </label>
      <ImageField
        value={imageKey}
        previewUrl={previewUrl}
        disabled={submitting}
        onChange={(next) => {
          setImageKey(next.imageKey);
          setPreviewUrl(next.previewUrl);
        }}
      />
      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitLabel}
        </button>
        <button type="button" className="btn--ghost" onClick={onCancel} disabled={submitting}>
          取消
        </button>
      </div>
    </form>
  );
}
