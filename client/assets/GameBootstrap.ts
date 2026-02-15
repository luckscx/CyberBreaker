import { _decorator, Component, Node, Label, Button, UITransform, Color, Vec2, Widget, Prefab, instantiate } from 'cc';
import { GameController } from './GameController';
import { Network, type GhostRecord } from './Network';
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
  @property(Prefab)
  buttonPrefab: Prefab | null = null;

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
      console.log('[GameBootstrap] scheduleOnce triggered, initializing lobby...');
      this.showLobby();
      // 页面加载时无 token 则向服务器发起游客登录
      if (!Network.getToken()) {
        console.log('[GameBootstrap] No token found, attempting guest login...');
        Network.guestLogin().then((res) => {
          if (res.code !== 0) {
            console.warn('[GameBootstrap] guest login failed:', res.message);
          } else {
            console.log('[GameBootstrap] guest login succeeded');
          }
        });
      } else {
        console.log('[GameBootstrap] Token found, skipping guest login.');
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
    title.addComponent(UITransform).setContentSize(600, 110);
    title.setPosition(0, 240, 0);
    const titleL = title.addComponent(Label);
    titleL.string = '潜行解码';
    titleL.fontSize = 72;
    titleL.color = new Color(255, 255, 255, 255);
    root.addChild(title);

    const btnSolo = this.createMenuButton('单机练习', 85);
    btnSolo.on(Button.EventType.CLICK, () => this.showBattle('solo'), this);
    root.addChild(btnSolo);

    const btnGhost = this.createMenuButton('幽灵对局', 0);
    btnGhost.on(Button.EventType.CLICK, () => this.enterGhostBattle(root, btnGhost), this);
    root.addChild(btnGhost);

    const btnRank = this.createMenuButton('排行榜', -85);
    btnRank.on(Button.EventType.CLICK, () => this.showLeaderboard(), this);
    root.addChild(btnRank);
  }

  private async enterGhostBattle(lobbyRoot: Node, btnGhost: Node) {
    const btn = btnGhost.getComponent(Button);
    const labelNode = btnGhost.getChildByName('Label');
    const label = labelNode?.getComponent(Label);
    const origText = label?.string ?? '幽灵对局';
    if (btn) btn.interactable = false;
    if (label) label.string = '匹配中...';

    if (!Network.getToken()) {
      const loginRes = await Network.guestLogin();
      if (loginRes.code !== 0) {
        if (btn) btn.interactable = true;
        if (label) label.string = origText;
        this.showLobbyTip(lobbyRoot, loginRes.message || '登录失败');
        return;
      }
    }

    const res = await Network.getGhost();
    if (res.code !== 0 || !res.data) {
      if (btn) btn.interactable = true;
      if (label) label.string = origText;
      this.showLobbyTip(lobbyRoot, res.code === 404 ? '暂无幽灵对局，请先玩单机' : (res.message || '拉取失败'));
      return;
    }
    this.showBattle('ghost', res.data);
  }

  private showLobbyTip(lobbyRoot: Node, text: string) {
    const tip = new Node('Tip');
    tip.addComponent(UITransform).setContentSize(400, 40);
    tip.setPosition(0, -120, 0);
    const l = tip.addComponent(Label);
    l.string = text;
    l.fontSize = 24;
    l.color = new Color(255, 220, 180, 255);
    lobbyRoot.addChild(tip);
    this.scheduleOnce(() => tip.destroy(), 2);
  }

  /** 排行榜页（方式 A：LeaderboardRoot） */
  showLeaderboard() {
    this.destroyCurrentRoot();
    const { w, h } = getViewSize(this.node);
    const root = new Node('LeaderboardRoot');
    const rt = root.addComponent(UITransform);
    rt.setContentSize(w, h);
    rt.setAnchorPoint(new Vec2(0.5, 0.5));
    root.setPosition(0, 0, 0);
    this.node.addChild(root);
    this.currentRoot = root;

    addGradientBg(root, w, h, LOBBY_TOP, LOBBY_BOTTOM);

    const title = new Node('Title');
    title.addComponent(UITransform).setContentSize(300, 50);
    title.setPosition(0, h / 2 - 50, 0);
    const titleL = title.addComponent(Label);
    titleL.string = '排行榜';
    titleL.fontSize = 40;
    titleL.color = new Color(255, 255, 255, 255);
    root.addChild(title);

    const listRoot = new Node('ListContent');
    listRoot.addComponent(UITransform).setContentSize(w - 80, h - 200);
    listRoot.setPosition(0, -20, 0);
    root.addChild(listRoot);

    const btnBack = this.createMenuButton('返回大厅', -h / 2 + 50);
    btnBack.on(Button.EventType.CLICK, () => this.showLobby(), this);
    root.addChild(btnBack);

    Network.getLeaderboard(1, 30).then((res) => {
      if (res.code !== 0 || !res.data) {
        const errNode = new Node('Err');
        errNode.addComponent(UITransform).setContentSize(400, 40);
        errNode.setPosition(0, 0, 0);
        const l = errNode.addComponent(Label);
        l.string = res.message || '加载失败';
        l.fontSize = 24;
        l.color = new Color(255, 200, 200, 255);
        listRoot.addChild(errNode);
        return;
      }
      const { list } = res.data;
      const rowH = 36;
      list.forEach((item, i) => {
        const row = new Node(`Row_${i}`);
        row.addComponent(UITransform).setContentSize(w - 100, rowH);
        row.setPosition(0, (list.length / 2 - i) * rowH, 0);
        const lab = row.addComponent(Label);
        lab.string = `${i + 1}. ${item.playerId.slice(0, 8)}… MMR ${item.mmr}`;
        lab.fontSize = 22;
        lab.color = new Color(255, 255, 255, 255);
        listRoot.addChild(row);
      });
    });
  }

  /** 进入对局：创建 BattleRoot，挂 GameController，由其在 onLoad 内程序化生成整棵对局 UI */
  showBattle(mode: BattleMode, ghostRecord?: GhostRecord | null) {
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
    if (this.buttonPrefab) gc.setButtonPrefab(this.buttonPrefab);
    gc.setBootstrap(this);
    if (mode === 'ghost' && ghostRecord) gc.setGhostRecord(ghostRecord);
  }

  private createMenuButton(text: string, yOffset: number): Node {
    if (this.buttonPrefab) {
      const btn = instantiate(this.buttonPrefab);
      btn.name = 'Btn_' + text;
      btn.setPosition(0, yOffset, 0);
      const ut = btn.getComponent(UITransform);
      if (ut) ut.setContentSize(280, 70);
      const labelNode = btn.getChildByName('Label');
      const l = labelNode?.getComponent(Label);
      if (l) l.string = text;
      return btn;
    }
    const btn = new Node('Btn_' + text);
    btn.addComponent(UITransform).setContentSize(280, 70);
    btn.setPosition(0, yOffset, 0);
    const label = new Node('Label');
    label.addComponent(UITransform).setContentSize(260, 50);
    const l = label.addComponent(Label);
    l.string = text;
    l.fontSize = 40;
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
