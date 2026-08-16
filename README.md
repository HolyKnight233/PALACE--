# PALACE

一个仅面向 Windows 的个人桌面助手：**自定义人设 + 流式聊天 + 本地日程（系统通知提醒）+ 番茄钟 + 文件处理**，用 Electron + TypeScript + React 构建，可打包成安装包与免安装便携版。

## 功能

- **自定义人设**：名字、角色、性格、说话风格、系统提示词、主题色，在「设置」页编辑。
- **聊天**：流式输出、多轮上下文、会话历史管理，支持工具调用（ReAct）。
- **日程**：自然语言（“明天下午三点提醒我开会”）或表单创建/查询/修改/删除，到点弹 Windows 系统通知。
- **文件处理**：对话中让助手读取（txt/md/csv/docx/xlsx/pdf）或写入（txt/md/docx/pdf/csv/xlsx）文件、按名称/内容搜索、查看/解压 ZIP；也可把文件拖入聊天框直接获取路径。
- **番茄钟**：工作/休息计时、预设管理、置顶/最小化，支持窗口与对话两种操作方式。
- **模型**：默认 DeepSeek（OpenAI 兼容），可切换 OpenAI 或任意自定义端点；API Key 用系统加密（DPAPI）保存在本机。
- **托盘常驻**：关闭窗口最小化到系统托盘（可在设置里关闭）；托盘菜单可显示窗口 / 退出。
- **开机自启**：设置里一键开启，随 Windows 登录自动启动。

## 目录结构

```
src/
  main/          Electron 主进程：窗口、IPC、Agent、LLM、日程/文件/提醒服务
  preload/       contextBridge 暴露 window.agentApi
  renderer/      React UI：聊天 / 日程 / 番茄钟 / 设置
  shared/        主进程与渲染层共享的类型定义
resources/       应用图标等资源
build/           打包资源（Windows 图标）
```

## 开发

```bash
npm install       # 安装依赖（会下载 Electron 二进制）
npm run dev       # 启动开发模式（HMR）
npm run typecheck # 类型检查
npm test          # 运行单元测试（vitest）
```

## 打包

```bash
npm run build:win   # 类型检查 + 构建 + 打包
```

> 打包时会联网下载 Electron 二进制，已配置 npmmirror 镜像（见 `electron-builder.yml` 的 `electronDownload.mirror`）。若你的网络访问 GitHub 稳定，可删除该配置；反之若镜像也慢，可改回官方源。

产物在 `dist/` 目录：

- `palace-<version>-setup.exe` — NSIS 安装包
- `palace-<version>-portable.exe` — 免安装便携版

## 使用

1. 首次启动后进入「设置」页，选择服务商并填入 API Key，点「保存设置」→「测试连接」。
2. 在「聊天」页用自然语言安排日程、读写/搜索文件或操作番茄钟。
3. 日程提醒需要应用保持运行；开启「关闭窗口时最小化到托盘」后，点关闭按钮应用会在后台常驻（用托盘菜单「退出」彻底退出）。

## 说明

- 数据保存在系统用户目录（`%APPDATA%\PALACE`），为 JSON 文件，便于查看与备份。
- 存储层抽象在 `src/main/db/store.ts`，如数据量变大可替换为 SQLite 而不影响上层。
- 安全边界：渲染层 `contextIsolation` 开启、`nodeIntegration` 关闭，所有特权操作都在主进程完成。

## 许可证与第三方开源软件

本项目采用 [MIT 许可证](./LICENSE)。

本项目使用了大量第三方开源软件（运行时依赖、渲染层依赖与 Electron），其完整清单与各许可证全文见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
