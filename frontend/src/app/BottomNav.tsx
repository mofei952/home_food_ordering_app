import { NavLink } from "react-router-dom";

import {
  IconDishes,
  IconFamily,
  IconSparkles,
  IconToday,
} from "../ui/icons";

const DESTINATIONS = [
  { to: "/", label: "今天", end: true, Icon: IconToday },
  { to: "/dishes", label: "菜品", end: false, Icon: IconDishes },
  { to: "/choose", label: "帮我选", end: false, Icon: IconSparkles },
  { to: "/family", label: "家庭", end: false, Icon: IconFamily },
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
          <item.Icon />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
