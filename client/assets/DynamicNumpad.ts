import { _decorator, Component, Node, Label, Button, UITransform, Color, Sprite } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('DynamicNumpad')
export class DynamicNumpad extends Component {

    // 键盘数据布局
    private keys: string[] = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9',
        'Del', '0', 'OK'
    ];

    start() {
        this.buildKeyboard();
    }

    private buildKeyboard() {
        // 1. 创建键盘的父容器节点
        const boardNode = new Node('KeyboardContainer');
        this.node.addChild(boardNode); // 挂载到当前脚本所在的节点（通常是 Canvas）

        // 设置按键尺寸和间距
        const keyWidth = 80;
        const keyHeight = 80;
        const spacing = 10;
        const columns = 3;

        // 2. 循环遍历数据，动态生成按键节点
        this.keys.forEach((keyText, index) => {
            // 计算行列位置 (基于网格布局)
            const row = Math.floor(index / columns);
            const col = index % columns;

            // 创建单个按键节点
            const keyNode = new Node(`Key_${keyText}`);
            boardNode.addChild(keyNode);

            // 设置节点尺寸和坐标 (以父节点中心为原点)
            const transform = keyNode.addComponent(UITransform);
            transform.setContentSize(keyWidth, keyHeight);
            
            // 计算 X 和 Y 坐标 (向下排布)
            const posX = col * (keyWidth + spacing) - (keyWidth + spacing);
            const posY = -(row * (keyHeight + spacing)) + (keyHeight + spacing);
            keyNode.setPosition(posX, posY, 0);

            // 3. 添加文字标签 (Label 组件)
            const labelNode = new Node('Label');
            keyNode.addChild(labelNode);
            const label = labelNode.addComponent(Label);
            label.string = keyText;
            label.fontSize = 30;
            label.color = new Color(255, 255, 255, 255); // 白色文字

            // 4. 添加按钮交互 (Button 组件)
            const button = keyNode.addComponent(Button);
            
            // 5. 绑定点击事件 (利用闭包传递当前的 keyText)
            keyNode.on(Button.EventType.CLICK, () => {
                this.onKeyPressed(keyText);
            }, this);
        });
    }

    // 统一处理键盘点击逻辑
    private onKeyPressed(key: string) {
        if (key === 'Del') {
            console.log('执行退格逻辑');
        } else if (key === 'OK') {
            console.log('执行提交比对逻辑');
        } else {
            console.log(`输入了数字: ${key}`);
            // TODO: 将输入的数字推入上方的密码显示槽中
        }
    }
}
