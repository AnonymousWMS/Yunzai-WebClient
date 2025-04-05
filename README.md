# Yunzai WebChat Client

一个基于 React 和 Ant Design X 构建的 Web 客户端
通过 WebSocket 连接和交互 Yunzai-Bot
旨在让Bot脱离QQ、微信等社交平台独立运行
**使用CursorAI的Gemini 2.5 Pro Exp制作**


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
*   已安装并能运行的 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) (GPL-3.0 许可)

## 🔧 安装与设置

1.  **克隆仓库:**
    ```bash
    Github
    git clone https://github.com/AnonymousWMS/Yunzai-WebClient.git
    cd Yunzai-WebClient
    ```
    ```bash
    Gitee（很有可能不更新）
    git clone https://gitee.com/AnonymousWMS/Yunzai-WebClient.git
    cd Yunzai-WebClient
    ```
    ```bash
    GitClone
    git clone https://gitclone.com/github.com /AnonymousWMS/Yunzai-WebClient.git
    cd Yunzai-WebClient
    ```

2.  **安装客户端依赖:**
    ```bash
    cd client
    pnpm install
    ```

3.  **放置适配器:**
    将项目根目录下的 `adapter/webchat.js` 文件复制到你的 TRSS-Yunzai 安装目录下的 `plugins/adapter/` 文件夹中。
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

## 💬 交流与支持
有疑问或建议，欢迎加入QQ群讨论：[点击加入QQ群](https://qm.qq.com/q/7rHaVwxrk4)（群号：774384554）
（我也很喜欢和人聊天QwQ）


## 🌱 期待您的建议  
我是一名计算机领域的业余爱好者，深知自己的项目还有许多不足之处。**例如：无法触发早柚核心，无法读取合并信息**
**如果您发现任何可以改进的地方，或是有任何灵感和想法愿意与我分享**，无论是善意的批评还是技术探讨，我都将虚心接受并感激不尽！  

您可以通过以下方式帮助这个项目成长：  
- **提交 Pull Request**：直接参与代码优化或功能扩展；  
- **报告 Issues**：指出问题或提出建议（哪怕是细微的疑问也非常欢迎）；  。  

这个项目因您的反馈而变得更好，非常感谢您的支持！ 🙏

您的每一项反馈都会让作者高兴一整年！🌸

✨ **提交 Pull Request 或报告 Issues**！请注意项目中不同部分的许可证声明  
模块可能采用不同的协议（MIT/Apache），提交代码前请确认

## 📄 许可证

本项目包含多个许可证下的组件：

*   **Web 客户端 (`client/` 目录):** 基于 MIT 许可的库构建，其本身采用 [MIT](./LICENSE) 许可证。
*   **Yunzai 适配器 (`adapter/webchat.js`):** 作为 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai) 的插件，此部分代码遵循 **GNU General Public License v3.0 (GPL-3.0)**。

使用或分发本项目时，请务必遵守各个组件对应的许可证要求。
