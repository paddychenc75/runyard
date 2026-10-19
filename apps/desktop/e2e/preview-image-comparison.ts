import type { Page } from "@playwright/test";

interface EvidenceImage {
  png: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 将原始截图按给定坐标绘入 CPU 画布并同步导出，保留尺寸与图层顺序。 */
export async function composeEvidence(
  page: Page,
  width: number,
  height: number,
  images: EvidenceImage[],
  captions: { text: string; x: number; y: number }[] = [],
): Promise<Buffer> {
  const png = await page.evaluate(
    async (input) => {
      const canvas = document.createElement("canvas");
      canvas.width = input.width;
      canvas.height = input.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("无法创建证据合成画布");
      context.fillStyle = "white";
      context.fillRect(0, 0, input.width, input.height);
      for (const source of input.images) {
        const image = new Image();
        image.src = `data:image/png;base64,${source.png}`;
        await image.decode();
        context.drawImage(image, source.x, source.y, source.width, source.height);
      }
      context.fillStyle = "#111";
      context.font = "16px system-ui";
      for (const caption of input.captions) context.fillText(caption.text, caption.x, caption.y);
      return canvas.toDataURL("image/png").split(",")[1] ?? "";
    },
    { width, height, images, captions },
  );
  return Buffer.from(png, "base64");
}
