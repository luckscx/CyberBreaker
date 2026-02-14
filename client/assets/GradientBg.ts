import { Node, UITransform, Graphics, Color, Vec2 } from 'cc';

/**
 * 程序化绘制渐变背景：用多条细矩形模拟垂直/对角渐变，无需贴图。
 */
export function addGradientBg(
  parent: Node,
  width: number,
  height: number,
  topColor: Color,
  bottomColor: Color,
  options?: { diagonal?: boolean; strips?: number }
): Node {
  const strips = options?.strips ?? 80;
  const diagonal = options?.diagonal ?? false;
  const node = new Node('GradientBg');
  const ut = node.addComponent(UITransform);
  ut.setContentSize(width, height);
  ut.setAnchorPoint(new Vec2(0.5, 0.5));
  node.setPosition(0, 0, 0);
  parent.addChild(node);
  node.setSiblingIndex(0);

  const g = node.addComponent(Graphics);
  const halfW = width / 2;
  const halfH = height / 2;
  const stripH = height / strips;

  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1);
    const r = Math.round(topColor.r * (1 - t) + bottomColor.r * t);
    const g_ = Math.round(topColor.g * (1 - t) + bottomColor.g * t);
    const b = Math.round(topColor.b * (1 - t) + bottomColor.b * t);
    const a = Math.round(topColor.a * (1 - t) + bottomColor.a * t);
    g.fillColor = new Color(r, g_, b, a);

    const y = -halfH + i * stripH;
    let x = -halfW;
    let w = width;
    if (diagonal) {
      const offset = (width * 0.3) * (1 - t);
      x = -halfW - offset;
      w = width + offset * 2;
    }
    g.rect(x, y, w, stripH + 1);
    g.fill();
  }

  return node;
}
