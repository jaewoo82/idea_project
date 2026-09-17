import { NextResponse } from "next/server";

import { recognizeCircuitFromImage } from "@/lib/circuit-recognition/raster-engine";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "이미지가 첨부되지 않았습니다." },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const outcome = await recognizeCircuitFromImage(bytes);

    if (outcome.components.length === 0 && outcome.ambiguous.length === 0) {
      return NextResponse.json(
        { error: "이미지에서 회로로 보이는 요소를 찾지 못했습니다." },
        { status: 422 }
      );
    }

    return NextResponse.json(outcome);
  } catch (error) {
    console.error("circuit recognize (image) failed", error);
    return NextResponse.json(
      { error: "이미지를 분석하지 못했습니다. 올바른 이미지 파일인지 확인해 주세요." },
      { status: 422 }
    );
  }
}
