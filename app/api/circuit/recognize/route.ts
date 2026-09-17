import { NextResponse } from "next/server";

import { recognizeCircuitFromPdf } from "@/lib/circuit-recognition/engine";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("pdf");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "PDF 파일이 첨부되지 않았습니다." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const outcome = await recognizeCircuitFromPdf(bytes);
    return NextResponse.json(outcome);
  } catch (error) {
    console.error("circuit recognize failed", error);
    return NextResponse.json(
      { error: "PDF를 분석하지 못했습니다. 올바른 PDF 파일인지 확인해 주세요." },
      { status: 422 }
    );
  }
}
