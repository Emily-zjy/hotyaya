import type { PetMemory } from "../ui/pet-model";
import {
  PluginSettingTab,
  Setting,
  SecretComponent,
  Modal,
  Notice,
  type App,
} from "obsidian";
import type CompanionPlugin from "../main";
export interface CompanionSettings {
  pet?: PetMemory;
  baseUrl: string;
  model: string;
  keyRef: string;
  imageBaseUrl: string;
  imageModel: string;
  imageKeyRef: string;
  searchUrl: string;
  crawlUrl: string;
  browserMcpUrl: string;
  localChrome: boolean;
  fastModel: string;
  autoComments: boolean;
  /** Empty: save next to the source note. */
  outputFolder: string;
}
export const DEFAULT_SETTINGS: CompanionSettings = {
  baseUrl: "",
  model: "",
  keyRef: "",
  imageBaseUrl: "",
  imageModel: "",
  imageKeyRef: "",
  searchUrl: "",
  crawlUrl: "",
  browserMcpUrl: "",
  localChrome: true,
  fastModel: "",
  autoComments: true,
  outputFolder: "",
};
class KeyModal extends Modal {
  constructor(
    app: App,
    private save: (value: string) => Promise<void>,
  ) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText("保存 API Key");
    let value = "";
    new Setting(this.contentEl)
      .setName("API Key")
      .setDesc("保存在 Obsidian SecretStorage，插件配置只保存名称。")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text.onChange((v) => {
          value = v;
        });
      });
    new Setting(this.contentEl).addButton((button) =>
      button
        .setButtonText("保存")
        .setCta()
        .onClick(async () => {
          if (!value.trim()) {
            new Notice("请输入 API Key。");
            return;
          }
          await this.save(value.trim());
          value = "";
          this.close();
        }),
    );
  }
  onClose() {
    this.contentEl.empty();
  }
}
export function renderSettings(
  container: HTMLElement,
  plugin: CompanionPlugin,
) {
  container.empty();
  container.createEl("p", {
    text: "先完成下方模型连接的 3 项配置，就能聊天、解读、翻译、润色和生成表格。联网、配图、PPT 是可选功能，可稍后配置。开启辅助器会把当前笔记或选区发送到你配置的模型。",
  });
  const field = (
    key: keyof CompanionSettings,
    name: string,
    placeholder: string,
    desc?: string,
    target = container,
  ) => {
    new Setting(target)
      .setName(name)
      .setDesc(desc ?? "")
      .addText((text) =>
        text
          .setPlaceholder(placeholder)
          .setValue(String(plugin.settings[key]))
          .onChange(async (value) => {
            Object.assign(plugin.settings, { [key]: value.trim() });
            await plugin.saveSettings();
          }),
      );
  };
  new Setting(container).setName("模型连接").setHeading();
  field(
    "baseUrl",
    "API 地址",
    "https://api.openai.com/v1",
    "从你购买/使用的模型服务商的 API 文档中复制 Base URL，不是聊天网页地址。支持 OpenAI 兼容接口；例如公司网关提供的地址。留空使用已发现的环境配置。",
  );
  field(
    "model",
    "模型名称",
    "填写服务中的模型 ID",
    "从同一服务商控制台的模型列表复制，与 API 地址和密钥来自同一服务。",
  );
  const secret = (
    key: "keyRef" | "imageKeyRef",
    name: string,
    id: string,
    target = container,
  ) => {
    new Setting(target)
      .setName(name)
      .setDesc(
        "在服务商控制台创建 API Key，再点“手动输入”；已有 Obsidian 共享密钥可点“链接”。留空使用对应环境变量。",
      )
      .addComponent((el) =>
        new SecretComponent(plugin.app, el)
          .setValue(plugin.settings[key])
          .onChange(async (value) => {
            plugin.settings[key] = value ?? "";
            await plugin.saveSettings();
          }),
      )
      .addButton((button) =>
        button.setButtonText("手动输入").onClick(() =>
          new KeyModal(plugin.app, async (value) => {
            plugin.app.secretStorage.setSecret(id, value);
            plugin.settings[key] = id;
            await plugin.saveSettings();
            renderSettings(container, plugin);
          }).open(),
        ),
      );
  };
  secret("keyRef", "模型密钥", "md-companion-model-key");
  field(
    "fastModel",
    "快速模型（可选）",
    "例如 gpt-4o-mini",
    "同一服务中响应更快的模型。用于自动评论和相关资讯；主模型连续卡住时，最后一次自动重试也改用它。留空则全部使用主模型。",
  );
  new Setting(container)
    .setName("自动发现已有配置")
    .setDesc("检测共享密钥名称与执行器环境变量，不扫描其他插件的配置文件。")
    .addButton((button) =>
      button.setButtonText("扫描配置").onClick(async () => {
        button.setDisabled(true);
        try {
          const health = await plugin.worker.health();
          const names = plugin.app.secretStorage.listSecrets();
          const summary = container.createDiv();
          summary.createEl("p", {
            text: `共享密钥：${names.length ? names.join("、") : "未发现"}。已加载 ${health.capabilities.skills.length} 个技能目录。`,
          });
          for (const provider of health.detected) {
            new Setting(summary)
              .setName(provider.provider)
              .setDesc(
                `${provider.baseUrl ?? "默认 API"} · ${provider.hasKey ? "已发现密钥" : "未发现密钥"}`,
              )
              .addButton((b) =>
                b.setButtonText("使用").onClick(async () => {
                  plugin.settings.baseUrl = provider.baseUrl ?? "";
                  plugin.settings.model =
                    provider.model ?? plugin.settings.model;
                  plugin.settings.keyRef = "";
                  await plugin.saveSettings();
                  renderSettings(container, plugin);
                }),
              );
          }
          if (!health.detected.length)
            summary.createEl("p", {
              text: "未发现支持的环境变量。可手动填写上方连接信息。",
            });
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "扫描失败");
        } finally {
          button.setDisabled(false);
        }
      }),
    );
  new Setting(container)
    .setName("测试连接")
    .setDesc("发送一条简短测试消息，不包含笔记内容。")
    .addButton((button) =>
      button.setButtonText("测试").onClick(async () => {
        button.setDisabled(true);
        try {
          await plugin.testConnection();
          new Notice("模型连接成功。");
        } catch (error) {
          new Notice(error instanceof Error ? error.message : "连接失败");
        } finally {
          button.setDisabled(false);
        }
      }),
    );
  new Setting(container).setName("阅读与导出").setHeading();
  new Setting(container)
    .setName("自动评论")
    .setDesc(
      "仅对已开启的当前笔记生效；停笔 12 秒后触发，两次评论至少间隔 60 秒。",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.autoComments).onChange(async (value) => {
        plugin.settings.autoComments = value;
        await plugin.saveSettings();
      }),
    );
  field(
    "outputFolder",
    "导出目录",
    "留空：保存到原笔记同目录",
    "HTML、PPT、配图默认保存在原笔记旁边；也可填写库内固定目录。导出不会覆盖同名文件。",
  );
  new Setting(container).addButton((button) =>
    button.setButtonText("重启执行器").onClick(() => {
      plugin.cancelAll();
      plugin.worker.stop();
      new Notice("执行器将在下一次请求时重新启动。");
    }),
  );
  const extras = container.createEl("details", { cls: "mdc-settings-extra" });
  extras.createEl("summary", {
    text: "可选功能：联网检索与企业配图（不用可留空）",
  });
  extras.createEl("p", {
    text: "下面不是必填项。127.0.0.1 代表你自己的电脑，只有启动对应服务后地址才可用；插件不会自动部署这些服务。",
  });
  const help = extras.createEl("p");
  help.createEl("a", {
    text: "SearXNG 部署说明",
    href: "https://docs.searxng.org/admin/installation-docker.html",
  });
  help.appendText(" · ");
  help.createEl("a", {
    text: "Crawl4AI 项目与部署说明",
    href: "https://github.com/unclecode/crawl4ai",
  });
  new Setting(extras).setName("联网检索（可选）").setHeading();
  field(
    "searchUrl",
    "SearXNG 地址",
    "未部署则留空",
    "由你或管理员部署 SearXNG 后提供地址，需要启用 JSON 搜索。仅“相关资讯”需要；其他文字功能不需要。",
    extras,
  );
  field(
    "crawlUrl",
    "Crawl4AI 地址",
    "未部署则留空",
    "由你或管理员部署 Crawl4AI 后提供地址；用于读取网页正文。留空仍可用 SearXNG 搜索摘要。",
    extras,
  );
  new Setting(extras)
    .setName("使用本机 Chrome 读取网页")
    .setDesc(
      "用本机已安装的 Google Chrome（无界面、临时独立配置，不读取你的 Cookie 和登录状态）通过 Playwright MCP 读取搜索结果正文。首次使用会从 npm 下载固定版本的 @playwright/mcp。开启后优先于下方远程地址。",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.localChrome).onChange(async (value) => {
        plugin.settings.localChrome = value;
        await plugin.saveSettings();
      }),
    );
  field(
    "browserMcpUrl",
    "远程 Playwright MCP 地址",
    "填写完整 /mcp 接口地址",
    "关闭本机 Chrome 时使用；两者都未配置时可用 Crawl4AI。每次搜索最多抓取 3 页；服务故障时明确降级为搜索摘要。",
    extras,
  );
  new Setting(extras).setName("企业配图（可选）").setHeading();
  field(
    "imageBaseUrl",
    "图像 API 地址",
    "留空复用模型 API 地址",
    "从图像服务商 API 文档复制；如果同一服务同时支持聊天和生图，可留空复用上方地址。",
    extras,
  );
  field(
    "imageModel",
    "图像模型名称",
    "不使用配图则留空",
    "从该服务的图像模型列表复制，需支持 images/generations 接口；聊天模型不一定支持生图。",
    extras,
  );
  secret("imageKeyRef", "图像密钥", "md-companion-image-key", extras);
}
export class CompanionSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private companion: CompanionPlugin,
  ) {
    super(app, companion);
  }
  display() {
    renderSettings(this.containerEl, this.companion);
  }
}
export class CompanionSettingsModal extends Modal {
  constructor(
    app: App,
    private companion: CompanionPlugin,
  ) {
    super(app);
  }
  onOpen() {
    this.titleEl.setText("hotyaya");
    renderSettings(this.contentEl, this.companion);
  }
  onClose() {
    this.contentEl.empty();
  }
}
