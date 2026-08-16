// pdf-parse 的 index.js 在 ESM 打包环境下会触发其调试分支（读取测试 PDF 导致崩溃），
// 这里直接声明其内部实现子路径的类型，绕开 index.js 的 `module.parent` 判断。
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    numpages: number
    numrender: number
    info: unknown
    metadata: unknown
    version: string
    text: string
  }
  function PdfParse(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PdfParseResult>
  export = PdfParse
}
