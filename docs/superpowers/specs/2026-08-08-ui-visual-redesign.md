# 家庭点菜 · 界面与交互改版设计（暖光餐桌）

- **状态**：已批准 · 已按默认选项落地（`main`，见 PR [#5](https://github.com/mofei952/home_food_ordering_app/pull/5) 及后续 UI 修复提交）
- **日期**：2026-08-08（规格）；2026-08-09（审核结论与文档同步）
- **范围**：仅前端表现层与交互；**不改变** API、业务规则与信息架构（仍为一底栏四入口）
- **依据**：改版前实现与已批准产品规格 `2026-08-08-family-food-ordering-design.md`

---

## 1. 改版目标

| 目标 | 说明 | 可度量 |
| --- | --- | --- |
| **更像「产品」而非「原型」** | 卡片、层次、图标、空状态、加载态齐全 | 核心页无「裸 `<p>` 列表」 |
| **决策更快** | 「今天」首屏 3 秒内看懂：哪天、哪餐、谁点了啥、能否确认 | 保留产品指标：中位确认 ≤3 分钟 |
| **移动单手友好** | 主操作在拇指区；次要操作收入菜单/底部抽屉 | 主按钮距底栏 ≥16px 安全区 |
| **有家庭温度、不幼稚** | 暖色厨房感 + 大图菜品，避免卡通插画堆砌 | — |

**非目标**：不改四 Tab 结构；不增加社交/社区；不上 AI 对话式 UI；不做深色模式首版（可预留 token）。

---

## 2. 改版前诊断（历史记录）

以下为 **P0 改版前** 的问题摘要，保留作对照；当前 `main` 已按第 3–5 节方案重构。

- **视觉**：暖橙 token 已有，但页面多为标题 + 段落 + 默认按钮，缺少卡片、间距节奏、字阶。
- **导航**：底栏仅文字，无图标，激活态对比弱。
- **「今天」**：日期/午晚餐为平铺按钮；点菜、确认菜单与状态混在同一纵向流，信息优先级不清。
- **「帮我选」**：随机结果与食材匹配为文章块，缺少「揭晓时刻」与筛选可视化。
- **反馈**：错误用 `role="alert"` 段落；成功无 toast；加载仅「正在加载…」。
- **图片**：有上传能力但列表/卡片未统一展示缩略图比例与占位。

---

## 3. 设计方向：「暖光餐桌」

### 3.1 气质关键词

温馨 · 利落 · 食物优先 · 家庭协作（多人痕迹可见）

### 3.2 视觉语言

**色彩**（在现有 token 上扩展，不推翻品牌橙）：

| Token | 用途 | 建议值 |
| --- | --- | --- |
| `--color-bg` | 页面底 | `#FFFBF7` |
| `--color-surface` | 卡片面 | `#FFFFFF` |
| `--color-surface-raised` | 浮层/底栏 | `rgba(255,255,255,0.92)` |
| `--color-brand` | 主色 CTA | `#C2410C`（略提饱和，仍暖） |
| `--color-brand-soft` | 选中底、标签 | `#FFEDD5` |
| `--color-ink` | 主文字 | `#292524` |
| `--color-muted` | 次要 | `#78716C` |
| `--color-success` | 已确认 | `#047857` |
| `--color-warning` | 草稿/待确认 | `#B45309` |
| `--shadow-sm` | 卡片 | `0 1px 3px rgba(28,25,23,0.08)` |

实现见 `frontend/src/styles/tokens.css`、`global.css`、`components.css`。

**字体**：保留中文系统栈；字阶 Display / Title / Body / Caption 见 `components.css` 工具类。

**圆角与间距**：卡片 `12px`；主按钮 `12px`；页面水平边距 `16px`；卡片内 `12–16px`；区块间距 `20–24px`。

**图标**：底栏与关键操作为 **内联 SVG**（`frontend/src/ui/icons.tsx`），约 24px 描边图标，与文字并排。

### 3.3 布局骨架

```text
┌─────────────────────────────┐
│ 顶栏：页标题 / 轻量操作        │  ← AppHeader
├─────────────────────────────┤
│   主内容（max-width 40rem）   │
├─────────────────────────────┤
│  今天  菜品  帮我选  家庭      │  ← 图标+文案，激活：品牌色 + pill
└─────────────────────────────┘
```

- **`AppHeader`**：`frontend/src/app/AppHeader.tsx`
- **底栏**：`BottomNav.tsx`，`position: fixed` + safe-area；激活项圆角 pill（见后续底栏修复提交）

---

## 4. 组件体系（CSS 策略）

1. **`styles/tokens.css`**：设计 token  
2. **`styles/components.css`**：BEM 类（`card`、`chip`、`segmented`、`bottom-sheet`、`toast`、`skeleton`、`empty-state` 等）  
3. **未引入** Tailwind / 重型 UI 库；**未使用** `@radix-ui/react-dialog`（BottomSheet 为自研，含焦点与 `aria-modal`）

| 组件 | 行为 | 代码位置 |
| --- | --- | --- |
| **Card** | 白底、浅阴影、状态色条 | `components.css` + 各页面 |
| **Chip / FilterChip** | 类别、餐次、食材多选 | `ui/Chip.tsx` |
| **SegmentedControl** | 午餐/晚餐、创建/加入 Tab | `ui/SegmentedControl.tsx` |
| **DishCard** | 图 + 名 + 类别 chip + 制作者 | `ui/DishCard.tsx` |
| **MemberAvatar** | 昵称首字圆形 | `ui/MemberAvatar.tsx` |
| **BottomSheet** | 选菜、菜品表单等 | `ui/BottomSheet.tsx` |
| **Toast** | 成功/轻错误 | `ui/Toast.tsx` |
| **Skeleton** | 首屏/列表占位 | `components.css` + 各页 |
| **EmptyState** | 文案引导 + 按钮（无独立插画组件） | `components.css` |

---

## 5. 分页面交互方案

### 5.1 onboarding（创建/加入家庭）

- 品牌区 + **分段控件**（创建 | 加入）  
- 全宽表单；创建成功展示邀请码卡片  
- Toast 用于严重错误提示  

实现：`OnboardingPage.tsx`

### 5.2 今天（核心）

1. **Sticky 控制条**：日期 chevron 切换；**午餐 | 晚餐** SegmentedControl（未做弹层日历，符合「先左右切换」）  
2. **状态卡**：草稿 / 已确认徽章  
3. **「想吃」**：聚合列表 + BottomSheet 选菜网格  
4. **确认菜单**：`MenuEditor` **上下箭头**调序；底栏固定主按钮「确认/更新菜单」  

实现：`TodayPage.tsx`、`MealRequests.tsx`、`MenuEditor.tsx`

### 5.3 菜品

- 搜索 + 筛选 BottomSheet（Chip）  
- **双列网格**（极窄屏 ≤340px 单列，与规格 ≥360px 略差，见 §9）  
- 顶栏「+」→ BottomSheet 表单  

实现：`DishListPage.tsx`、`DishForm.tsx`

### 5.4 帮我选

- Tab：**随机一道** | **按食材找**  
- Chip 筛选 + 结果展示与「加入今晚点菜」  
- 食材：标签选择与分组结果  

实现：`ChooseForMePage.tsx`、`IngredientPicker.tsx`

### 5.5 家庭

- 成员卡、邀请码（创建者）、成员列表  
- **历史菜单**：`timeline` 列表样式  

实现：`FamilyPage.tsx`、`HistoryPage.tsx`

### 5.6 全局

- 离线 banner、部分 skeleton、Toast  
- `prefers-reduced-motion` 在 `global.css` 中处理动效  

---

## 6. 技术实施计划与状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| **P0 基础** | tokens、AppHeader、底栏图标、Card/Chip/Segmented/Toast/Skeleton | ✅ 已完成 |
| **P1 今天** | 吸顶控制条、选菜 BottomSheet、状态卡、确认底栏 | ✅ 已完成 |
| **P2 菜品** | 网格、搜索、Sheet 表单 | ✅ 已完成 |
| **P3 帮我选 + 家庭** | Tab、随机/食材 UI、历史时间线 | ✅ 已完成 |
| **P4** | 快照更新、E2E、`data-testid`、可选 Playwright 截图回归 | ⚠️ 部分：E2E 与单测已随改版维护；**未**单独上 Playwright 视觉回归流水线 |

**测试**：`frontend/e2e/`、`*.test.tsx` 覆盖主流程；关键路径以 role/文案与部分 `data-testid` 为主。

**依赖**：未新增 Radix / Lucide；图标为内联 SVG。

---

## 7. 拍板选项（已确认：全部默认）

产品负责人于开发前 **批准按下列默认项执行**（与当时口头/Agent 指令一致）。

1. **整体风格**  
   - [x] **A. 暖光餐桌**（白卡片 + 暖橙）  
   - [ ] B. 更极简  
   - [ ] C. 更浓郁  

2. **菜品列表密度**  
   - [x] **双列网格**（默认）  
   - [ ] 单列大图  

3. **表单交互**  
   - [x] **BottomSheet**（默认，适合手机）  
   - [ ] 独立全屏页  

4. **图标方案**  
   - [x] **内联 SVG / 本地图标集**（零依赖）  
   - [ ] Lucide React  

5. **菜单排序**  
   - [x] 首版仅 **上下箭头** 调序  
   - [ ] 首版拖拽排序  

---

## 8. 审核结论

- [x] **批准**，按 P0→P4 开发  
- [ ] 修改后批准  
- [ ] 暂缓  

**备注**：已批准默认选项 A + 双列 + BottomSheet + 内联 SVG + 箭头排序。实现已合入 `main`；本文档用于归档设计与实现对照，后续增量需求另开规格或 PR。

---

## 9. 实现对照与已知差异

| 规格项 | 实现情况 |
| --- | --- |
| 暖光 token 与组件库 | ✅ `tokens.css` / `components.css` |
| 底栏图标 + pill 激活 | ✅ |
| 今天页信息分层与固定确认区 | ✅（含底栏与根滚动修复） |
| 菜品双列网格 | ✅ 断点 340px 单列（规格写 360px，可后续统一） |
| 拖拽排序菜单 | ❌ 未做（按拍板使用箭头） |
| EmptyState 插画 SVG | ⚠️ 仅文案 + 样式类，无独立插图组件 |
| Skeleton 全覆盖 | ⚠️ 主要列表/首屏，非每一异步区块 |
| 日期弹层日历 | ❌ 未做（仅左右日切换） |
| Radix 无障碍抽屉 | ❌ 未引入（自研 BottomSheet） |
| Playwright 截图回归 | ❌ 未配置 |

---

*文档版本：v1.0 · 已批准默认方案 · 实现状态以 `main` 代码为准*
