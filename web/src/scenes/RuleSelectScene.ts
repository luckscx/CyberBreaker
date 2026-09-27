import type { Application } from "pixi.js";
import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { SceneChrome } from "@/components/SceneChrome";
import { playClick } from "@/audio/click";
import type { RoomRule } from "@/room/client";
import { Color, Font, Radius, Size } from "@/ui/theme";

export interface RuleSelectSceneOptions {
  app: Application;
  onBack: () => void;
  onSelect: (rule: RoomRule) => void;
}

interface RuleDef {
  rule: RoomRule;
  name: string;
  desc: string;
  highlights: string[];
}

const RULES: RuleDef[] = [
  {
    rule: "standard",
    name: "标准对战",
    desc: "4 位不重复数字",
    highlights: ["A = 数字与位置都对", "B = 数字对但位置错"],
  },
  {
    rule: "position_only",
    name: "位置赛",
    desc: "4 位数字可重复",
    highlights: ["仅反馈位置完全正确的个数", "没有 B，纯拼推理速度"],
  },
  {
    rule: "guess_person",
    name: "猜人名",
    desc: "系统随机选一位名人",
    highlights: ["双方轮流选题获取线索", "抢先猜出人名即获胜"],
  },
];

/**
 * 选择对战规则。
 *
 * 这个界面原来内联在 `Game.ts` 的 `showRuleSelect()` 里 —— 用绝对坐标手写
 * 背景 / 返回键 / 音乐键 / 标题，标题还挂在 `h * 0.18` 这种按屏高比例的位置上，
 * 于是同一款游戏里"联机对战"入口的顶栏和别的页面都不一样。
 * 现在抽成独立场景并接入 SceneChrome，与其余页面完全统一。
 */
export class RuleSelectScene extends Container {
  private chrome: SceneChrome;
  private defs: RuleDef[] = RULES;

  constructor(private opts: RuleSelectSceneOptions) {
    super();
    const app = opts.app;
    const w = app.screen.width;
    const h = app.screen.height;
    const cx = w / 2;

    this.chrome = new SceneChrome({
      width: w,
      height: h,
      onBack: () => opts.onBack(),
      title: "选择对战规则",
      subtitle: "选好后创建房间，把链接发给对手即可开战",
      particleCount: 20,
    });
    this.addChild(this.chrome);

    const cardW = Math.min(320, w - 32);
    const cardH = 104;
    const gap = 14;
    // 从顶栏下方开始，卡片自适应可用高度；不足时压缩间距而不是溢出屏幕
    const availTop = this.chrome.contentTop + 10;
    const avail = this.chrome.contentBottom - availTop;
    const needed = this.defs.length * cardH + (this.defs.length - 1) * gap;
    const scale = needed > avail ? Math.max(0.7, avail / needed) : 1;
    const realH = cardH * scale;
    const realGap = gap * scale;

    this.defs.forEach((def, i) => {
      const card = this._buildCard(def, cardW, realH, cx);
      card.y = availTop + realH / 2 + i * (realH + realGap);
      this.addChild(card);
    });
  }

  private _buildCard(def: RuleDef, cardW: number, cardH: number, cx: number): Container {
    const card = new Container();
    card.x = cx;
    card.eventMode = "static";
    card.cursor = "pointer";

    card.hitArea = new Rectangle(-cardW / 2, -cardH / 2, cardW, cardH);
    const outline = new Graphics();
    card.addChild(outline);

    const draw = (hover: boolean) => {
      outline.clear();
      outline
        .roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.lg)
        .fill({ color: hover ? Color.bgPanelHover : Color.bgPanel, alpha: 0.92 });
      outline
        .roundRect(-cardW / 2, -cardH / 2, cardW, cardH, Radius.lg)
        .stroke({
          width: hover ? 2 : 1.4,
          color: hover ? Color.primary : Color.lineStrong,
          alpha: hover ? 0.95 : 0.7,
        });
      // 左侧色条，突出规则名
      outline
        .roundRect(-cardW / 2 + 6, -cardH / 2 + 10, 3, cardH - 20, 2)
        .fill({ color: Color.primary, alpha: hover ? 1 : 0.5 });
    };
    draw(false);

    const name = new Text({
      text: def.name,
      style: {
        fontFamily: Font.sans,
        fontSize: Size.body + 2,
        fill: Color.primary,
        fontWeight: "bold",
      },
    });
    name.anchor.set(0, 0.5);
    name.position.set(-cardW / 2 + 18, -cardH / 2 + 22);
    card.addChild(name);

    const desc = new Text({
      text: def.desc,
      style: { fontFamily: Font.sans, fontSize: Size.caption, fill: Color.textMuted },
    });
    desc.anchor.set(0, 0.5);
    desc.position.set(-cardW / 2 + 18, -cardH / 2 + 44);
    card.addChild(desc);

    def.highlights.forEach((line, i) => {
      const t = new Text({
        text: `· ${line}`,
        style: { fontFamily: Font.sans, fontSize: Size.caption, fill: Color.textSub },
      });
      t.anchor.set(0, 0.5);
      t.position.set(-cardW / 2 + 18, -cardH / 2 + 64 + i * 16);
      card.addChild(t);
    });

    card.on("pointerover", () => draw(true));
    card.on("pointerout", () => draw(false));
    card.on("pointertap", () => {
      playClick();
      this.opts.onSelect(def.rule);
    });

    return card;
  }
}
