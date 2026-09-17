"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type {
  AmbiguityResolution,
  AmbiguousItem,
  MvpComponentType,
} from "@/lib/circuit-recognition/types";

const TYPE_LABEL_KO: Record<MvpComponentType, string> = {
  resistor: "저항",
  capacitor: "커패시터",
  inductor: "인덕터",
  diode: "다이오드",
  "voltage-source": "전압원",
  ground: "접지",
  wire: "배선",
};

interface CircuitAmbiguityDialogProps {
  item: AmbiguousItem | null;
  index: number;
  total: number;
  onResolve: (resolution: AmbiguityResolution) => void;
}

export function CircuitAmbiguityDialog({
  item,
  index,
  total,
  onResolve,
}: CircuitAmbiguityDialogProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customText, setCustomText] = useState("");

  if (!item) return null;

  function resolveAndReset(resolution: AmbiguityResolution) {
    onResolve(resolution);
    setShowCustom(false);
    setCustomText("");
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            애매한 소자 확인 ({index + 1}/{total})
          </DialogTitle>
          <DialogDescription>
            {item.label
              ? `"${item.label}" 라벨 근처의 소자가 무엇인지 확신할 수 없습니다.`
              : "어떤 소자인지 확신할 수 없습니다."}{" "}
            아래에서 선택해 주세요.
          </DialogDescription>
        </DialogHeader>

        {!showCustom ? (
          <div className="flex flex-col gap-2">
            {item.candidateTypes.map((type) => (
              <Button
                key={type}
                type="button"
                variant="outline"
                onClick={() =>
                  resolveAndReset({ itemId: item.id, kind: "type", type })
                }
              >
                {TYPE_LABEL_KO[type]}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCustom(true)}
            >
              그 외 (직접 입력)
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              autoFocus
              placeholder="이 소자가 실제로 무엇인지 입력하세요"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCustom(false)}
              >
                뒤로
              </Button>
              <Button
                type="button"
                disabled={!customText.trim()}
                onClick={() =>
                  resolveAndReset({
                    itemId: item.id,
                    kind: "custom",
                    description: customText.trim(),
                  })
                }
              >
                확인
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => resolveAndReset({ itemId: item.id, kind: "unknown" })}
          >
            모르겠음
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
