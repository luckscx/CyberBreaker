# Cocos Creator MCP 工具按类列表

- 小节标题为**逻辑分类**（供 SKILL 意图匹配）；调用时用该小节内的 **底层 category** 与 **tool_name** 拼接。
- 完整工具名：`mcp_cocos-creator_{底层category}_{tool_name}`  
  例：node_query 下用底层 category `node`、tool_name `get_node_info` → `mcp_cocos-creator_node_get_node_info`。

---

## scene_management

底层 category: **scene**

| tool_name |
|-----------|
| get_current_scene |
| get_scene_list |
| open_scene |
| save_scene |
| create_scene |
| save_scene_as |
| close_scene |
| get_scene_hierarchy |

---

## node_query

底层 category: **node**

| tool_name |
|-----------|
| get_node_info |
| find_nodes |
| find_node_by_name |
| get_all_nodes |
| detect_node_type |

---

## node_lifecycle

底层 category: **node**

| tool_name |
|-----------|
| create_node |
| delete_node |
| move_node |
| duplicate_node |

---

## node_transform

底层 category: **node**

| tool_name |
|-----------|
| set_node_property |
| set_node_transform |

---

## component_manage

底层 category: **component**

| tool_name |
|-----------|
| add_component |
| remove_component |
| set_component_property |

---

## component_script

底层 category: **component**

| tool_name |
|-----------|
| attach_script |

---

## component_query

底层 category: **component**

| tool_name |
|-----------|
| get_components |
| get_component_info |
| get_available_components |

---

## prefab_browse

底层 category: **prefab**

| tool_name |
|-----------|
| get_prefab_list |
| load_prefab |
| get_prefab_info |
| validate_prefab |

---

## prefab_lifecycle

底层 category: **prefab**

| tool_name |
|-----------|
| create_prefab |
| update_prefab |
| revert_prefab |
| duplicate_prefab |
| restore_prefab_node |

---

## prefab_instance

底层 category: **prefab**

| tool_name |
|-----------|
| instantiate_prefab |

---

## asset_manage

底层 category: **project**

| tool_name |
|-----------|
| refresh_assets |
| import_asset |
| get_asset_info |
| get_assets |
| create_asset |
| copy_asset |
| move_asset |
| delete_asset |
| save_asset |
| reimport_asset |
| query_asset_path |
| query_asset_uuid |
| query_asset_url |
| find_asset_by_name |
| get_asset_details |

---

## asset_analyze

底层 category: **assetAdvanced**

| tool_name |
|-----------|
| save_asset_meta |
| generate_available_url |
| query_asset_db_ready |
| open_asset_external |
| batch_import_assets |
| batch_delete_assets |
| validate_asset_references |
| get_asset_dependencies |
| get_unused_assets |
| compress_textures |
| export_asset_manifest |

---

## project_manage

底层 category: **project**

| tool_name |
|-----------|
| get_project_info |
| get_project_settings |
| run_project |
| start_preview_server |
| stop_preview_server |

---

## project_build_system

底层 category: **project**

| tool_name |
|-----------|
| build_project |
| get_build_settings |
| open_build_panel |
| check_builder_status |

---

## debug_console

底层 category: **debug**

| tool_name |
|-----------|
| get_console_logs |
| clear_console |
| execute_script |
| get_node_tree |
| get_performance_stats |
| validate_scene |
| get_editor_info |

---

## debug_logs

底层 category: **debug**

| tool_name |
|-----------|
| get_project_logs |
| get_log_file_info |
| search_project_logs |

---

## preferences_manage

底层 category: **preferences**

| tool_name |
|-----------|
| open_preferences_settings |
| query_preferences_config |
| set_preferences_config |
| get_all_preferences |
| reset_preferences |
| export_preferences |
| import_preferences |

---

## server_info

底层 category: **server**

| tool_name |
|-----------|
| query_server_ip_list |
| query_sorted_server_ip_list |
| query_server_port |
| get_server_status |
| check_server_connectivity |
| get_network_interfaces |

---

## broadcast_message

底层 category: **broadcast**

| tool_name |
|-----------|
| get_broadcast_log |
| listen_broadcast |
| stop_listening |
| clear_broadcast_log |
| get_active_listeners |

---

## 可选：scene_advanced

底层 category: **sceneAdvanced**（撤销、复制粘贴、快照、场景重载等）

| tool_name |
|-----------|
| reset_node_property |
| move_array_element |
| remove_array_element |
| copy_node |
| paste_node |
| cut_node |
| reset_node_transform |
| reset_component |
| restore_prefab |
| execute_component_method |
| execute_scene_script |
| scene_snapshot |
| scene_snapshot_abort |
| begin_undo_recording |
| end_undo_recording |
| cancel_undo_recording |
| soft_reload_scene |
| query_scene_ready |
| query_scene_dirty |
| query_scene_classes |
| query_scene_components |
| query_component_has_script |
| query_nodes_by_asset_uuid |

---

## 可选：scene_view

底层 category: **sceneView**（Gizmo、2D/3D 视图、聚焦等）

| tool_name |
|-----------|
| change_gizmo_tool |
| query_gizmo_tool_name |
| change_gizmo_pivot |
| query_gizmo_pivot |
| query_gizmo_view_mode |
| change_gizmo_coordinate |
| query_gizmo_coordinate |
| change_view_mode_2d_3d |
| query_view_mode_2d_3d |
| set_grid_visible |
| query_grid_visible |
| set_icon_gizmo_3d |
| query_icon_gizmo_3d |
| set_icon_gizmo_size |
| query_icon_gizmo_size |
| focus_camera_on_nodes |
| align_camera_with_view |
| align_view_with_node |
| get_scene_view_status |
| reset_scene_view |

---

## 可选：reference_image

底层 category: **referenceImage**（参考图）

| tool_name |
|-----------|
| add_reference_image |
| remove_reference_image |
| switch_reference_image |
| set_reference_image_data |
| query_reference_image_config |
| query_current_reference_image |
| refresh_reference_image |
| set_reference_image_position |
| set_reference_image_scale |
| set_reference_image_opacity |
| list_reference_images |
| clear_all_reference_images |

---

## 可选：validation

底层 category: **validation**（JSON/请求校验）

| tool_name |
|-----------|
| validate_json_params |
| safe_string_value |
| format_mcp_request |
