export type LayoutAiToken = {
  text: string;
  label?: string;
  confidence?: number;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type LayoutAiEntity = {
  type: string;
  value: string;
  confidence?: number;
};

export type LayoutAiResult = {
  modelName?: string;
  tokens: LayoutAiToken[];
  entities: LayoutAiEntity[];
  warnings: string[];
};

export function getLayoutAiBackendUrl() {
  return String(import.meta.env.VITE_DOCUMENT_AI_BACKEND_URL ?? "").replace(/\/$/, "");
}

export function isLayoutAiBackendConfigured() {
  return Boolean(getLayoutAiBackendUrl());
}

export async function analyzeLayoutWithModel(file: File): Promise<LayoutAiResult> {
  const baseUrl = getLayoutAiBackendUrl();

  if (!baseUrl) {
    throw new Error(
      "Analiza LayoutLM/LayoutXLM nu este disponibilă momentan. Fluxul OCR local rămâne activ.",
    );
  }

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${baseUrl}/analyze-layout`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      "Analiza LayoutLM/LayoutXLM nu este disponibilă momentan. Fluxul OCR local rămâne activ.",
    );
  }

  const data = (await response.json()) as Partial<LayoutAiResult> & {
    model_name?: string;
    ocr_tokens?: LayoutAiToken[];
    extracted_entities?: LayoutAiEntity[];
  };

  return {
    modelName: data.modelName ?? data.model_name ?? "LayoutLM/LayoutXLM",
    tokens: data.tokens ?? data.ocr_tokens ?? [],
    entities: data.entities ?? data.extracted_entities ?? [],
    warnings: data.warnings ?? [],
  };
}
