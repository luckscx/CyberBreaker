import { _decorator, Component, Node, Label, Button, UITransform, Prefab, instantiate, Color } from 'cc';
const { ccclass } = _decorator;

export interface KeyboardCallbacks {
  onDigit(digit: string): void;
  onDel(): void;
  onConfirm(): void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Del', '0', 'OK'];
const KEY_WIDTH = 88;
const KEY_HEIGHT = 88;
const KEY_SPACING = 12;
const KEY_COLUMNS = 3;

export function buildKeyboard(parent: Node, callbacks: KeyboardCallbacks, buttonPrefab: Prefab | null = null): Node {
  const boardNode = new Node('KeyboardContainer');
  parent.addChild(boardNode);

  KEYS.forEach((keyText, index) => {
    const row = Math.floor(index / KEY_COLUMNS);
    const col = index % KEY_COLUMNS;
    const posX = col * (KEY_WIDTH + KEY_SPACING) - (KEY_WIDTH + KEY_SPACING);
    const posY = -(row * (KEY_HEIGHT + KEY_SPACING)) + (KEY_HEIGHT + KEY_SPACING);

    let keyNode: Node;
    if (buttonPrefab) {
      keyNode = instantiate(buttonPrefab);
      keyNode.name = `Key_${keyText}`;
      const ui = keyNode.getComponent(UITransform);
      if (ui) {
        ui.setContentSize(KEY_WIDTH, KEY_HEIGHT);
      }
      keyNode.setPosition(posX, posY, 0);
      const labelNode = keyNode.getChildByName('Label');
      const label = labelNode ? labelNode.getComponent(Label) : keyNode.getComponentInChildren(Label);
      if (label) label.string = keyText;
    } else {
      keyNode = new Node(`Key_${keyText}`);
      const transform = keyNode.addComponent(UITransform);
      transform.setContentSize(KEY_WIDTH, KEY_HEIGHT);
      keyNode.setPosition(posX, posY, 0);
      const labelNode = new Node('Label');
      keyNode.addChild(labelNode);
      const label = labelNode.addComponent(Label);
      label.string = keyText;
      label.fontSize = 34;
      label.color = new Color(255, 255, 255, 255);
      keyNode.addComponent(Button);
    }
    boardNode.addChild(keyNode);
    keyNode.on(Button.EventType.CLICK, () => {
      if (keyText === 'Del') callbacks.onDel();
      else if (keyText === 'OK') callbacks.onConfirm();
      else callbacks.onDigit(keyText);
    }, parent);
  });
  return boardNode;
}

@ccclass('DynamicNumpad')
export class DynamicNumpad extends Component {
  private _callbacks: KeyboardCallbacks | null = null;

  setCallbacks(c: KeyboardCallbacks) {
    this._callbacks = c;
  }

  start() {
    if (this._callbacks) {
      buildKeyboard(this.node, this._callbacks);
    }
  }
}
