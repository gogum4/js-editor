import { type CSSProperties, useEffect, useState } from "react";

import { isAssetHash } from "@gogum4/editor-schema/assets";
import { useEditorPorts, useEditorStrings } from "../context";
import { assetCacheFor } from "@gogum4/editor-core";

interface AssetImageProps {
  hash: string;
  mime: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 저장소의 이미지를 보여 준다. 읽는 동안에는 자리표시, 읽지 못하면(저장소에 없거나 오류) 안내를 보인다.
 * 에디터의 이미지 블록과 버전 비교 화면이 함께 쓴다.
 */
export function AssetImage({ hash, mime, alt, className, style }: AssetImageProps) {
  const { assets } = useEditorPorts();
  const strings = useEditorStrings().image;
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; url: string } | { status: "error" }>({ status: "loading" });
  /** 동기화가 이미지를 받았다는 알림이 올 때마다 늘려 다시 읽는다. */
  const [arrivals, setArrivals] = useState(0);

  useEffect(() => {
    if (!isAssetHash(hash)) {
      setState({ status: "error" });
      return;
    }
    let cancelled = false;
    let stopWaiting: (() => void) | null = null;
    let giveUp: ReturnType<typeof setTimeout> | null = null;
    setState({ status: "loading" });
    assetCacheFor(assets).loadUrl(hash, mime).then(
      (url) => {
        if (!cancelled) setState({ status: "ready", url });
      },
      (error: unknown) => {
        if (cancelled) return;
        // 이 기기에 없는 이미지(다른 기기에서 온 본문)라면 동기화에 받아 달라고 요청하고, 도착하면 다시 읽는다. 받을 곳이 없거나 오래 오지 않으면 오류로 보인다.
        if (assets.requestRemote?.(hash) && assets.onArrived) {
          stopWaiting = assets.onArrived(hash, () => setArrivals((n) => n + 1));
          giveUp = setTimeout(() => setState({ status: "error" }), 120_000);
          return;
        }
        console.warn("이미지를 읽지 못했어요", hash, error);
        setState({ status: "error" });
      },
    );
    return () => {
      cancelled = true;
      stopWaiting?.();
      if (giveUp) clearTimeout(giveUp);
    };
  }, [assets, hash, mime, arrivals]);

  if (state.status === "ready") {
    return <img src={state.url} alt={alt} draggable={false} className={className} style={style} data-asset-hash={hash} />;
  }
  return (
    <div className="image-placeholder" data-asset-state={state.status} role="img" aria-label={alt || strings.alt}>
      {state.status === "loading" ? strings.loading : strings.failed}
    </div>
  );
}
