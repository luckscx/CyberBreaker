import { _decorator, Component, Node, Label, Button, UITransform, Color, Vec2, Widget } from 'cc';
import { GameController } from './GameController';
import { Network } from './Network';
import { GameAudio } from './GameAudio';
import { addGradientBg } from './GradientBg';

const { ccclass, property } = _decorator;

const DESIGN_W = 1280;
const DESIGN_H = 720;

const LOBBY_TOP = new Color(45, 27, 78, 255);
const LOBBY_BOTTOM = new Color(13, 10, 46, 255);
const BATTLE_TOP = new Color(15, 33, 55, 255);
const BATTLE_BOTTOM = new Color(8, 18, 32, 255);

/** 从节点取当前视图尺寸（设计分辨率下的可视区域），用于多端自适应 */
function getViewSize(node: Node): { w: number; h: number } {
  const ut = node.getComponent(UITransform);
  if (!ut) return { w: DESIGN_W, h: DESIGN_H };
  const c = ut.contentSize;
  if (c.width > 0 && c.height > 0) return { w: c.width, h: c.height };
  return { w: DESIGN_W, h: DESIGN_H };
}

export type BattleMode = 'solo' | 'ghost';

/** 方式 A：单场景入口，切换 LobbyRoot / BattleRoot（对局）/ Result 由 GameController 弹窗处理 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private currentRoot: Node | null = null;

  onLoad() {
    if (!this.node.getComponent(GameAudio)) this.node.addComponent(GameAudio);
    const ut = this.node.getComponent(UITransform) || this.node.addComponent(UITransform);
    ut.setAnchorPoint(new Vec2(0.5, 0.5));
    this.node.setPosition(0, 0, 0);
    const widget = this.node.getComponent(Widget) || this.node.addComponent(Widget);
    widget.alignFlags = 45;
    widget.left = 0;
    widget.right = 0;
    widget.top = 0;
    widget.bottom = 0;
    widget.updateAlignment();
    this.scheduleOnce(() => {
      this.showLobby();
      if (!Network.getToken()) {
        Network.guestLogin().then((res) => {
          if (res.code !== 0) console.warn('[GameBootstrap] guest login failed:', res.message);
        });
      }
    }, 0);
  }

  /** 显示大厅：单机练习、后续可加幽灵对局/排行榜 */
  showLobby() {
    this.destroyCurrentRoot();
    const { w, h } = getViewSize(this.node);
    const root = new Node('LobbyRoot');
    const rt = root.addComponent(UITransform);
    rt.setContentSize(w, h);
    rt.setAnchorPoint(new Vec2(0.5, 0.5));
    root.setPosition(0, 0, 0);
    this.node.addChild(root);
    this.currentRoot = root;

    addGradientBg(root, w, h, LOBBY_TOP, LOBBY_BOTTOM, { diagonal: true });

    const title = new Node('Title');
    title.addComponent(UITransform).setContentSize(400, 60);
    title.setPosition(0, 120, 0);
    const titleL = title.addComponent(Label);
    titleL.string = '潜行解码';
    titleL.fontSize = 48;
    titleL.color = new Color(255, 255, 255, 255);
    root.addChild(title);

    const btnSolo = this.createMenuButton('单机练习', 20);
    btnSolo.on(Button.EventType.CLICK, () => this.showBattle('solo'), this);
    root.addChild(btnSolo);
  }

  /** 进入对局：创建 BattleRoot，挂 GameController，由其在 onLoad 内程序化生成整棵对局 UI */
  showBattle(mode: BattleMode) {
    this.destroyCurrentRoot();
    const { w, h } = getViewSize(this.node);
    const battleRoot = new Node('BattleRoot');
    const bt = battleRoot.addComponent(UITransform);
    bt.setContentSize(w, h);
    bt.setAnchorPoint(new Vec2(0.5, 0.5));
    battleRoot.setPosition(0, 0, 0);
    this.node.addChild(battleRoot);
    this.currentRoot = battleRoot;

    addGradientBg(battleRoot, w, h, BATTLE_TOP, BATTLE_BOTTOM);

    const gc = battleRoot.addComponent(GameController);
    gc.setBootstrap(this);
  }

  private createMenuButton(text: string, yOffset: number): Node {
    const btn = new Node('Btn_' + text);
    btn.addComponent(UITransform).setContentSize(240, 56);
    btn.setPosition(0, yOffset, 0);
    const label = new Node('Label');
    label.addComponent(UITransform).setContentSize(200, 40);
    const l = label.addComponent(Label);
    l.string = text;
    l.fontSize = 28;
    l.color = new Color(255, 255, 255, 255);
    btn.addChild(label);
    btn.addComponent(Button);
    return btn;
  }

  private destroyCurrentRoot() {
    if (this.currentRoot) {
      this.currentRoot.destroy();
      this.currentRoot = null;
    }
  }
}
