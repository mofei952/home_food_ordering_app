import { NavLink } from "react-router-dom";

const DESTINATIONS = [
  { to: "/", label: "今天", end: true },
  { to: "/dishes", label: "菜品", end: false },
  { to: "/choose", label: "帮我选", end: false },
  { to: "/family", label: "家庭", end: false },
] as const;

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {DESTINATIONS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            isActive ? "bottom-nav__link is-active" : "bottom-nav__link"
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
