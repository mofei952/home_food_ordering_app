import type { ReactNode } from "react";

interface DishCardProps {
  name: string;
  category?: string;
  imageUrl?: string | null;
  subtitle?: string;
  onSelect?: () => void;
  selectLabel?: string;
  footer?: ReactNode;
}

export function DishCard({
  name,
  category,
  imageUrl,
  subtitle,
  onSelect,
  selectLabel = "选择",
  footer,
}: DishCardProps) {
  return (
    <article className="dish-card">
      <div className="dish-card__media">
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" />
        ) : (
          <div className="dish-card__placeholder">暂无图片</div>
        )}
      </div>
      <div className="dish-card__body">
        <h3 className="dish-card__name">{name}</h3>
        {category ? (
          <span className="chip is-selected" style={{ alignSelf: "flex-start" }}>
            {category}
          </span>
        ) : null}
        {subtitle ? (
          <p className="page__lead" style={{ margin: 0 }}>
            {subtitle}
          </p>
        ) : null}
        {footer ?? (onSelect ? (
          <div className="dish-card__actions">
            <button type="button" data-write="true" onClick={onSelect}>
              {selectLabel}
            </button>
          </div>
        ) : null)}
      </div>
    </article>
  );
}
