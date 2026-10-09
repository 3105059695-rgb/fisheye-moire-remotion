import { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Composition,
  continueRender,
  delayRender,
  cancelRender,
  interpolate,
  Easing,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import "@fontsource/noto-sans-sc/400.css";
import { drawMessage, FONT_TEXT } from "./draw-message";
import { createLensRenderer } from "./effects/lens";

export type FisheyeProps = {
  strength: number;
  scanline: number;
  moire: number;
  vignette: number;
  highlightColor: string;
};

export const FisheyeMessage: React.FC<FisheyeProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createLensRenderer> | null>(null);
  const source = useRef<HTMLCanvasElement | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [fontHandle] = useState(() => delayRender("Load bundled Chinese font"));
  useEffect(() => {
    let live = true;
    document.fonts
      .load('72px "Noto Sans SC"', FONT_TEXT)
      .then(() => {
        if (live) setFontsReady(true);
        continueRender(fontHandle);
      })
      .catch(cancelRender);
    return () => {
      live = false;
    };
  }, [fontHandle]);
  useEffect(() => {
    if (!canvas.current) return;
    renderer.current = createLensRenderer(canvas.current);
    source.current = document.createElement("canvas");
    source.current.width = width + 800;
    source.current.height = height + 800;
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [width, height]);
  useEffect(() => {
    if (!fontsReady || !source.current || !renderer.current) return;
    const handle = delayRender(`Draw deterministic frame ${frame}`);
    try {
      const time = frame / fps;
      const turn = interpolate(time, [0.16, 0.85], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      const highlight = interpolate(time, [1, 1.7], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.out(Easing.cubic),
      });
      drawMessage(source.current, highlight, props.highlightColor, turn);
      renderer.current.render(source.current, {
        strength: props.strength,
        tilt: turn * 0.1,
        rotate: turn * 0.04,
        panX: turn * 46,
        panY: turn * -54,
        zoom: 1.04,
        scanline: props.scanline,
        moire: props.moire,
        vignette: props.vignette,
        time,
      });
      continueRender(handle);
    } catch (error) {
      cancelRender(error);
    }
  }, [frame, fps, fontsReady, props]);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <canvas
        ref={canvas}
        width={width}
        height={height}
        style={{ width: "100%", height: "100%" }}
      />
    </AbsoluteFill>
  );
};

export const MyComposition = () => (
  <Composition
    id="FisheyeMessage"
    component={FisheyeMessage}
    width={1080}
    height={1102}
    fps={30}
    durationInFrames={60}
    defaultProps={{
      strength: 0.32,
      scanline: 0.65,
      moire: 0.4,
      vignette: 0.48,
      highlightColor: "#edd512",
    }}
  />
);
