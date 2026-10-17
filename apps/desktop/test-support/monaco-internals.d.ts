// 测试里要触发 Monaco 的命令、读它的配置服务：这几个内部模块没有类型声明，只声明用到的部分

declare module "monaco-editor/editor/standalone/browser/standaloneServices.js" {
  export const StandaloneServices: { get<T>(id: unknown): T };
}
declare module "monaco-editor/platform/commands/common/commands.js" {
  export const ICommandService: unknown;
}
declare module "monaco-editor/platform/configuration/common/configuration.js" {
  export const IConfigurationService: unknown;
}
declare module "monaco-editor/editor/common/services/languageFeatures.js" {
  export const ILanguageFeaturesService: unknown;
}
