import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { Color, Font, Play, Radius, Size } from "@/ui/theme";
import { computeGuessRowLayout } from "@/ui/layout";

/** 一条猜猜看记录 */
export interface GuessRecord {
  /** 猜测内容（4 个物品，数字或 emoji） */
  guess: string;
  /** A：数字对且位置对 */
  a: number;
  /** B：数字对但位置错 */
  b: number;
  /** 可选：附加说明（道具效果等），单独占一行 */
  note?: string;
}

export interface GuessBoardOptions {
  width: number;
  height: number;
  /** 空态文案 */
  emptyText?: string;
  /** 标题，默认「猜测记录」 */
  title?: string;
  /** 是否在标题右侧显示 A/B 图例，默认 true */
  legend?: boolean;
}

/** 历史板左右内边距（行背景距板边） */
const PAD_X = 10;

interface RowView {
  root: Container;
  bg: Graphics;
}

/**
 * 统一的历史记录板。
 *
 * 这是本次重构的核心收敛点：此前 5 个玩法场景各写了一套历史展示
 * （有的画卡片圆环、有的拼成一段等宽文本、有的只是纯文本行），
 * 结果既不一致，又都看不清 A/B 到底是多少。
 *
 * 现在全站只有这一种历史呈现：
 *   序号 | 猜的 4 个物品（方块） | A 徽章 | B 徽章
 * 所有内容都被排布在行背景**内部**，不会再出现徽章溢出背景的情况。
 *
 * 交互：内容超出时可上下拖动查看历史；新记录始终插到顶部，不打断正在翻看的用户。
 */
export class GuessBoard extends Container {
  private w: number;
  private h: number;
  private rowsView: Container;
  private rowsInner: Container;
  private maskG: Graphics;
  private emptyText: Text;
  private countText: Text;
  private rowViews: RowView[] = [];
  private records: GuessRecord[] = [];

  /** 滚动偏移：0 = 顶部（最新一条） */
  private offset = 0;
  private dragging = false;
  private dragStartY = 0;
  private dragStartOffset = 0;
  private moved = 0;

  private readonly headerH: number;
  private readonly viewH: number;

  constructor(opts: GuessBoardOptions) {
    super();
    this.w = opts.width;
    this.h = opts.height;
    this.headerH = 26;
    this.viewH = Math.max(0, this.h - this.headerH - 4);

    // ── 外框（铺垫在最底层）──
    const frame = new Graphics();
    frame
      .roundRect(0, 0, this.w, this.h, Radius.md)
      .fill({ color: Color.bgPanel, alpha: 0.55 });
    frame
      .roundRect(0, 0, this.w, this.h, Radius.md)
      .stroke({ width: 1, color: Color.line, alpha: 0.9 });
    this.addChild(frame);

    // ── 标题 + 条数（左侧）──
    const title = new Text({
      text: opts.title ?? "猜测记录",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.bodySm,
        fill: Color.textSub,
        fontWeight: "600",
      },
    });
    title.x = PAD_X + 2;
    title.y = 7;
    this.addChild(title);

    this.countText = new Text({
      text: "",
      style: { fontFamily: Font.mono, fontSize: Size.micro, fill: Color.textFaint },
    });
    this.countText.anchor.set(0, 0);
    this.countText.x = PAD_X + 2 + title.width + 6;
    this.countText.y = 9;
    this.addChild(this.countText);

    // ── A/B 图例（右侧）：把「A/B 各代表什么」直接写在界面上 ──
    if (opts.legend !== false) {
      const legend = new Container();
      let cx = 0; // 局部游标，累计宽度（不要用 Container.width，那会触发缩放）
      const mk = (label: string, color: number): void => {
        const dot = new Graphics();
        dot.circle(cx + 4, 0, 4).fill({ color, alpha: 0.9 });
        legend.addChild(dot);
        const t = new Text({
          text: label,
          style: { fontFamily: Font.sans, fontSize: Size.micro, fill: Color.textMuted },
        });
        t.anchor.set(0, 0.5);
        t.x = cx + 11;
        legend.addChild(t);
        cx += 11 + t.width + 10;
      };
      mk("位置对", Color.success);
      mk("数字对", Color.accent);
      const legendW = Math.max(0, cx - 10);
      legend.y = 13;
      legend.x = Math.max(PAD_X + 2, this.w - PAD_X - 2 - legendW);
      // 空间不足以同时容纳标题 + 条数 + 图例时隐藏图例，避免文字重叠
      if (legend.x < this.countText.x + 44) legend.visible = false;
      this.addChild(legend);
    }

    // ── 滚动视口 ──
    this.rowsView = new Container();
    this.rowsView.y = this.headerH;
    this.rowsInner = new Container();
    this.rowsView.addChild(this.rowsInner);

    // 遮罩坐标是 rowsView 的**局部**坐标（rowsView.y 已为 headerH），故从 y=0 起算
    this.maskG = new Graphics();
    this.maskG.rect(0, 0, this.w, this.viewH).fill({ color: 0xffffff });
    this.rowsView.addChild(this.maskG);
    this.rowsView.mask = this.maskG;
    this.addChild(this.rowsView);

    // ── 空态 ──
    this.emptyText = new Text({
      text: opts.emptyText ?? "还没有猜测记录\n输入 4 位后点确认",
      style: {
        fontFamily: Font.sans,
        fontSize: Size.caption,
        fill: Color.textFaint,
        align: "center",
        lineHeight: 18,
      },
    });
    this.emptyText.anchor.set(0.5);
    this.emptyText.x = this.w / 2;
    this.emptyText.y = this.headerH + this.viewH / 2;
    this.addChild(this.emptyText);

    this._bindScroll();
    this._refresh();
  }

  /** 记录是否可滚动（内容超出视口） */
  private get contentH(): number {
    const n = this.rowViews.length;
    if (n === 0) return 0;
    return n * (Play.rowHeight + Play.rowGap) - Play.rowGap;
  }

  private get maxOffset(): number {
    return Math.max(0, this.contentH - this.viewH);
  }

  /** 全量替换记录（外部传入完整列表，最旧在前） */
  setRecords(records: GuessRecord[]): void {
    const grew = records.length > this.records.length;
    this.records = records.slice();
    this._refresh();
    // 新记录到来时回到顶部，让玩家立刻看到最新结果；
    // 若玩家正翻看旧记录（offset > 0）则不打扰。
    if (grew && this.offset === 0) this._applyOffset(0);
  }

  /** 追加一条记录 */
  push(record: GuessRecord): void {
    this.records.push(record);
    this._refresh();
  }

  clear(): void {
    this.records = [];
    this.offset = 0;
    this._refresh();
  }

  private _refresh(): void {
    this.rowViews.forEach((r) => r.root.destroy({ children: true }));
    this.rowViews = [];
    this.rowsInner.removeChildren();

    // 最新在最上：倒序渲染
    const ordered = this.records.slice().reverse();
    ordered.forEach((rec, i) => {
      const seq = this.records.length - 1 - i;
      const row = this._buildRow(rec, seq);
      row.root.y = i * (Play.rowHeight + Play.rowGap);
      this.rowsInner.addChild(row.root);
      this.rowViews.push(row);
    });

    this.emptyText.visible = this.records.length === 0;
    this.countText.text = this.records.length > 0 ? `${this.records.length} 次` : "";
    this.offset = Math.min(this.offset, this.maxOffset);
    this._applyOffset(this.offset);
  }

  private _applyOffset(v: number): void {
    this.offset = Math.max(0, Math.min(v, this.maxOffset));
    this.rowsInner.y = -this.offset;
  }

  /**
   * 构建一行：序号 + 4 个物品方块 + A/B 徽章。
   * 所有元素都按行宽精确排布，A/B 徽章**右对齐到行内边距**，
   * 因此永远不会像旧实现那样溢出到背景之外。
   */
  private _buildRow(rec: GuessRecord, seq: number): RowView {
    const root = new Container();
    const rw = this.w - PAD_X * 2;
    // 行内几何全部来自纯函数，含「徽章绝不越界 / 不与方块重叠」的不变量
    const L = computeGuessRowLayout(rw);

    const bg = new Graphics();
    root.addChild(bg);
    bg.x = PAD_X;

    const win = rec.a === 4;
    const bar = new Graphics();
    bar
      .roundRect(0, 0, rw, L.rowH, Play.rowRadius)
      .fill({ color: win ? 0x10321f : Color.bgDeep, alpha: win ? 0.95 : 0.75 });
    bar
      .roundRect(0, 0, rw, L.rowH, Play.rowRadius)
      .stroke({
        width: win ? 1.6 : 1,
        color: win ? Color.success : Color.lineStrong,
        alpha: win ? 0.95 : 0.55,
      });
    bg.addChild(bar);

    const cy = L.rowH / 2;

    // 序号
    const idx = new Text({
      text: `${seq + 1}`,
      style: {
        fontFamily: Font.mono,
        fontSize: Size.micro,
        fill: win ? Color.success : Color.textFaint,
        fontWeight: "600",
      },
    });
    idx.anchor.set(0.5);
    idx.x = L.indexW / 2;
    idx.y = cy;
    bg.addChild(idx);

    // 4 个物品方块
    const chars = Array.from(rec.guess);
    for (let i = 0; i < 4; i++) {
      const chip = L.chipSize;
      const cx = L.chipCenters[i];

      const g = new Graphics();
      g.roundRect(cx - chip / 2, cy - chip / 2, chip, chip, 7).fill({
        color: win ? 0x1b4030 : 0x18243a,
        alpha: 0.95,
      });
      g.roundRect(cx - chip / 2, cy - chip / 2, chip, chip, 7).stroke({
        width: 1,
        color: win ? Color.success : Color.lineStrong,
        alpha: 0.7,
      });
      bg.addChild(g);

      const t = new Text({
        text: chars[i] ?? "",
        style: {
          fontFamily: Font.mono,
          fontSize: Math.round(chip * 0.62),
          fill: win ? Color.primarySoft : Color.text,
          fontWeight: "bold",
        },
      });
      t.anchor.set(0.5);
      t.position.set(cx, cy + 0.5);
      bg.addChild(t);
    }

    // A / B 徽章（位置由纯函数保证在行内右对齐）
    this._drawBadge(bg, L.aBadgeX, cy, `${rec.a}A`, rec.a > 0 ? Color.success : Color.textFaint, L.badgeR);
    this._drawBadge(bg, L.bBadgeX, cy, `${rec.b}B`, rec.b > 0 ? Color.accent : Color.textFaint, L.badgeR);

    return { root, bg };
  }

  private _drawBadge(
    parent: Container,
    x: number,
    y: number,
    label: string,
    color: number,
    r: number
  ): void {
    const g = new Graphics();
    g.circle(x, y, r).fill({ color: 0x000000, alpha: 0.35 });
    g.circle(x, y, r).stroke({ width: 1.4, color, alpha: 0.9 });
    parent.addChild(g);

    const t = new Text({
      text: label,
      style: {
        fontFamily: Font.mono,
        fontSize: Size.micro + 1,
        fill: color,
        fontWeight: "bold",
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y + 0.5);
    parent.addChild(t);
  }

  /** 垂直拖动滚动：只在内容确实溢出时才接管手势，避免吃掉本应落到键盘的点击 */
  private _bindScroll(): void {
    this.rowsView.eventMode = "static";
    // 同样使用 rowsView 局部坐标（相对 rowsView 原点）
    this.rowsView.hitArea = new Rectangle(0, 0, this.w, this.viewH);

    this.rowsView.on("pointerdown", (e) => {
      if (this.maxOffset <= 0) return;
      this.dragging = true;
      this.moved = 0;
      this.dragStartY = e.global.y;
      this.dragStartOffset = this.offset;
    });

    this.rowsView.on("globalpointermove", (e) => {
      if (!this.dragging) return;
      const dy = e.global.y - this.dragStartY;
      this.moved = Math.max(this.moved, Math.abs(dy));
      this._applyOffset(this.dragStartOffset - dy);
    });

    const endDrag = () => {
      this.dragging = false;
    };
    this.rowsView.on("pointerup", endDrag);
    this.rowsView.on("pointerupoutside", endDrag);
    this.rowsView.on("pointercancel", endDrag);
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    this.rowViews = [];
    super.destroy(options);
  }
}
