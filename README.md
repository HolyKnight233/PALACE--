# 个人桌面 AI Agent

一个仅面向 Windows 的个人桌面助手：**自定义人设 + 流式聊天 + 本地日程（系统通知提醒）+ 文件整理**，用 Electron + TypeScript + React 构建，可打包成安装包与免安装便携版。

## 功能

- 🧑‍🎨 **自定义人设**：名字、角色、性格、说话风格、系统提示词、主题色，在「设置」页编辑。
- 💬 **聊天**：流式输出、多轮上下文、会话历史管理，支持工具调用（ReAct）。
- 📅 **日程**：自然语言（“明天下午三点提醒我开会”）或表单创建/查询/修改/删除，到点弹 Windows 系统通知。
- 🗂️ **文件整理**：按扩展名 / 修改月份 / 文件名正则分组，先预览、确认后执行、可一键撤销。**聊天里的文件整理只会预览，绝不真正移动文件。**
- 🔌 **模型**：默认 DeepSeek（OpenAI 兼容），可切换 OpenAI 或任意自定义端点；API Key 用系统加密（DPAPI）保存在本机。
- 🖥️ **托盘常驻**：关闭窗口最小化到系统托盘（可在设置里关闭）；托盘菜单可显示窗口 / 退出。
- 🚀 **开机自启**：设置里一键开启，随 Windows 登录自动启动。
- 🔄 **自动更新**：内置 `electron-updater`，配置好更新服务器 URL 后自动检查并提示升级。

## 目录结构

```
src/
  main/          Electron 主进程：窗口、IPC、Agent、LLM、日程/文件/提醒服务
  preload/       contextBridge 暴露 window.agentApi
  renderer/      React UI：聊天 / 日程 / 文件 / 设置
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

- `personal-agent-<version>-setup.exe` — NSIS 安装包
- `personal-agent-<version>-portable.exe` — 免安装便携版

## 使用

1. 首次启动后进入「设置」页，选择服务商并填入 API Key，点「保存设置」→「测试连接」。
2. 在「聊天」页用自然语言安排日程或让助手预览整理文件。
3. 日程提醒需要应用保持运行；开启「关闭窗口时最小化到托盘」后，点关闭按钮应用会在后台常驻（用托盘菜单「退出」彻底退出）。

## 自动更新

内置 `electron-updater`，走 `generic`（静态服务器）提供方。启用步骤：

1. 把 `electron-builder.yml` 里 `publish.url` 改成你托管更新包的地址（如 `https://updates.example.com/my-agent`）。
2. 每次发布时，把 `dist/` 下的 `personal-agent-<version>-setup.exe`、`personal-agent-<version>-setup.exe.blockmap` 和 `latest.yml` 一并上传到该地址。
3. 用户安装后应用会自动检查更新，下载完成后提示重启安装。

## 代码签名

未签名安装包首次运行时，Windows SmartScreen 可能提示“未知发布者”，点「更多信息 → 仍要运行」即可。要消除该提示，需购买代码签名证书后启用签名（详见 `electron-builder.yml` 中 `win` 段的注释）：

```bash
# 方式一：环境变量（推荐）
$env:CSC_LINK = "C:\path\to\cert.pfx"
$env:CSC_KEY_PASSWORD = "证书密码"
npm run build:win
```

## 说明

- 数据保存在系统用户目录（`%APPDATA%\Personal Agent`），为 JSON 文件，便于查看与备份。
- 存储层抽象在 `src/main/db/store.ts`，如数据量变大可替换为 SQLite 而不影响上层。
- 安全边界：渲染层 `contextIsolation` 开启、`nodeIntegration` 关闭，所有特权操作都在主进程完成。
