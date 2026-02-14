---
name: cocos-creator-mcp
description: Guides the agent to use Cocos Creator MCP tools by category instead of all 157 tools at once. Use when editing Cocos Creator projects, manipulating scenes/nodes/prefabs/assets, running or building the project, or when the user mentions scene, node, component, prefab, asset, build, debug, or editor.
---

# Cocos Creator MCP 按类调用

## 何时使用

用户涉及 Cocos Creator 编辑器操作时（场景、节点、组件、预制体、资源、运行/构建、调试、偏好设置等），按**需求先选类别**，再只调用该类别下的 MCP 工具，避免一次性考虑全部 157 个工具。

## 调用流程

1. **判断意图**：从用户请求推断需要的**主类别**（见下表）。
2. **查工具列表**：在 [categories.md](categories.md) 中打开对应类别，确认该类别下的 MCP 工具名（调用时使用 `mcp_cocos-creator_{category}_{tool_name}` 形式）。
3. **仅调用该类别工具**：只使用该类别下列出的工具完成任务。

## 意图 → 类别 速查

| 用户需求 | 主类别 | 说明 |
|----------|--------|------|
| 获取/打开/保存/新建/关闭场景、场景列表、层级 | **scene_management** | 场景管理 |
| 查找节点、获取节点信息、获取所有节点 | **node_query** | 节点查询 |
| 创建/删除/移动/复制节点 | **node_lifecycle** | 节点增删改 |
| 设置节点位置/旋转/缩放、属性 | **node_transform** | 节点变换与属性 |
| 添加/移除组件、设置组件属性 | **component_manage** | 组件增删与属性 |
| 挂载脚本到节点 | **component_script** | 脚本挂载 |
| 查询组件列表、组件信息、可用组件类型 | **component_query** | 组件查询 |
| 浏览预制体列表、加载/查看/验证预制体 | **prefab_browse** | 预制体浏览 |
| 创建/更新/复制/还原预制体 | **prefab_lifecycle** | 预制体创建与同步 |
| 在场景中实例化预制体 | **prefab_instance** | 预制体实例化 |
| 导入/创建/复制/移动/删除/保存资源、查询路径/UUID | **asset_manage** | 资源增删改查 |
| 依赖分析、未使用资源、引用校验、纹理压缩等 | **asset_analyze** | 资源分析与高级 |
| 运行项目、预览、构建、构建配置、项目信息 | **project_manage** / **project_build_system** | 项目与构建 |
| 控制台日志、清空控制台、执行脚本、节点树、性能、场景校验 | **debug_console** | 调试与控制台 |
| 项目日志文件、搜索日志、日志级别 | **debug_logs** | 日志文件 |
| 偏好设置打开/查询/设置/导入导出 | **preferences_manage** | 偏好设置 |
| 服务器状态、端口、IP、连通性、网络接口 | **server_info** | 服务器信息 |
| 广播日志、监听/停止监听、清除广播 | **broadcast_message** | 消息广播 |

多需求时，可组合多个类别，每次只展开当前步骤需要的类别并在 categories.md 中查具体工具名。

## 工具名格式

- 调用时使用完整名：`mcp_cocos-creator_{category}_{tool_name}`
- 例如：`mcp_cocos-creator_scene_get_current_scene`、`mcp_cocos-creator_node_create_node`
- categories.md 中按类别列出的是 `{category}_{tool_name}`，需加上前缀 `mcp_cocos-creator_` 再调用。

## 详细工具列表

每个类别下的具体工具名与参数见 [categories.md](categories.md)。仅在使用到某类别时再查阅该文件对应小节，实现渐进式披露。
