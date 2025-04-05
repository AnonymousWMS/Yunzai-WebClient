# Yunzai WebChat Client

一个基于 React 和 Ant Design X 构建的 Web 客户端，用于通过 WebSocket 连接和交互 Yunzai-Bot。


## ✨ 特性

*   使用 Ant Design X 构建的现代化聊天界面
*   通过 WebSocket (正向) 连接到自定义的 `webchat.js` Yunzai 适配器
*   支持发送文本消息
*   支持接收文本和图片消息 (图片 Buffer 渲染)
*   可自定义 WebSocket 连接地址
*   支持点击图片切换显示大小
*   自适应布局

## 🚀 先决条件

*   [Node.js](https://nodejs.org/) (建议 LTS 版本)
*   [pnpm](https://pnpm.io/) (或 npm/yarn)
*   已安装并能运行的 [Yunzai-Bot](https://gitee.com/Le-niao/Yunzai-Bot) (GPL-3.0 许可)

## 🔧 安装与设置

1.  **克隆仓库:**
    ```bash
    git clone https://github.com/你的用户名/你的仓库名.git # 替换为你的仓库地址
    cd 你的仓库名
    ```

2.  **安装客户端依赖:**
    ```bash
    cd client
    pnpm install
    cd ..
    ```

3.  **放置适配器:**
    将项目根目录下的 `adapter/webchat.js` 文件复制到你的 Yunzai-Bot 安装目录下的 `plugins/adapter/` 文件夹中。
    **注意:** 此适配器是为 GPL-3.0 许可的 Yunzai-Bot 编写的插件，因此受 GPL-3.0 许可证约束。

## 💡 使用方法

1.  **启动 Yunzai-Bot:**
    确保 `webchat.js` 适配器已启用并成功加载。

2.  **启动 Web 客户端:**
    ```bash
    cd client
    pnpm dev
    ```

3.  **连接:**
    在客户端界面顶部的输入框中确认 WebSocket 地址正确，然后点击“连接”按钮。

4.  **交互:**
    连接成功后，即可与 Yunzai-Bot 进行交互。

## 🤝 贡献 (可选)

欢迎提交 Pull Request 或报告 Issues！请注意项目中不同部分的许可证。

## 📄 许可证

本项目包含多个许可证下的组件：

*   **Web 客户端 (`client/` 目录):** 基于 MIT 许可的库构建，其本身采用 [MIT](./LICENSE) 许可证。
*   **Yunzai 适配器 (`adapter/webchat.js`):** 作为 [Yunzai-Bot](https://gitee.com/Le-niao/Yunzai-Bot) 的插件，此部分代码遵循 **GNU General Public License v3.0 (GPL-3.0)**。

使用或分发本项目时，请务必遵守各个组件对应的许可证要求。
