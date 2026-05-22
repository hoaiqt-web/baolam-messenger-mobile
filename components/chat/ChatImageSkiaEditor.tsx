import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Canvas,
  Image as SkiaImage,
  ImageFormat,
  Line,
  matchFont,
  Oval,
  Path as SkiaPath,
  Rect,
  Skia,
  Text as SkiaText,
  useCanvasRef,
  useImage,
} from '@shopify/react-native-skia';

const COLOR_PRESETS = ['#E53935', '#FB8C00', '#43A047', '#1E88E5', '#FFFFFF', '#212121'];

export type EditorMode = 'draw' | 'text' | 'crop' | 'shape';
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow';

export type Stroke = {
  points: { nx: number; ny: number }[];
  color: string;
  width: number;
};

export type ShapeAnno = {
  kind: ShapeKind;
  nx0: number;
  ny0: number;
  nx1: number;
  ny1: number;
  color: string;
  strokeWidth: number;
};

export type TextAnno = {
  id: string;
  nx: number;
  ny: number;
  text: string;
  color: string;
  fontRel: number;
};

type HistorySnap = {
  strokes: Stroke[];
  shapes: ShapeAnno[];
  texts: TextAnno[];
};

const MAX_HISTORY = 30;

export type ChatImageSkiaEditorHandle = {
  exportComposite: () => Promise<string | null>;
  undo: () => void;
  canUndo: boolean;
};

type Props = {
  imageUri: string;
  onWorkingUriChange: (uri: string) => void;
};

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function buildSkPath(stroke: Stroke, ox: number, oy: number, dw: number, dh: number) {
  const p = Skia.Path.Make();
  if (stroke.points.length === 0) return p;
  const { nx, ny } = stroke.points[0];
  p.moveTo(ox + nx * dw, oy + ny * dh);
  for (let i = 1; i < stroke.points.length; i++) {
    const q = stroke.points[i];
    p.lineTo(ox + q.nx * dw, oy + q.ny * dh);
  }
  return p;
}

function arrowHeadPath(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  headLen: number,
  headAngle: number,
) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const a1 = ang + Math.PI - headAngle;
  const a2 = ang + Math.PI + headAngle;
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x1 + headLen * Math.cos(a1), y1 + headLen * Math.sin(a1));
  p.moveTo(x1, y1);
  p.lineTo(x1 + headLen * Math.cos(a2), y1 + headLen * Math.sin(a2));
  return p;
}

export const ChatImageSkiaEditor = forwardRef<ChatImageSkiaEditorHandle, Props>(
  function ChatImageSkiaEditor({ imageUri, onWorkingUriChange }, ref) {
    const canvasRef = useCanvasRef();
    const insets = useSafeAreaInsets();
    const image = useImage(imageUri);

    const [layoutW, setLayoutW] = useState(1);
    const [layoutH, setLayoutH] = useState(1);
    const [mode, setMode] = useState<EditorMode>('draw');
    const [shapeKind, setShapeKind] = useState<ShapeKind>('rect');
    const [brushColor, setBrushColor] = useState('#E53935');
    const [brushWidth, setBrushWidth] = useState(8);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [shapes, setShapes] = useState<ShapeAnno[]>([]);
    const [texts, setTexts] = useState<TextAnno[]>([]);
    const [draftStroke, setDraftStroke] = useState<{ nx: number; ny: number }[] | null>(null);
    const [draftShape, setDraftShape] = useState<{
      nx0: number;
      ny0: number;
      nx1: number;
      ny1: number;
    } | null>(null);
    const [draftCrop, setDraftCrop] = useState<{
      nx0: number;
      ny0: number;
      nx1: number;
      ny1: number;
    } | null>(null);
    const [history, setHistory] = useState<HistorySnap[]>([
      { strokes: [], shapes: [], texts: [] },
    ]);
    const [textModal, setTextModal] = useState<{ nx: number; ny: number; input: string } | null>(
      null,
    );

    const modeRef = useRef(mode);
    const shapeKindRef = useRef(shapeKind);
    const brushColorRef = useRef(brushColor);
    const brushWidthRef = useRef(brushWidth);
    modeRef.current = mode;
    shapeKindRef.current = shapeKind;
    brushColorRef.current = brushColor;
    brushWidthRef.current = brushWidth;

    const imgW = image?.width() ?? 0;
    const imgH = image?.height() ?? 0;

    const geom = useMemo(() => {
      if (imgW <= 0 || imgH <= 0 || layoutW <= 0 || layoutH <= 0) {
        return { ox: 0, oy: 0, dw: 0, dh: 0 };
      }
      const s = Math.min(layoutW / imgW, layoutH / imgH);
      const w = imgW * s;
      const h = imgH * s;
      return {
        ox: (layoutW - w) / 2,
        oy: (layoutH - h) / 2,
        dw: w,
        dh: h,
      };
    }, [imgW, imgH, layoutW, layoutH]);

    const { ox, oy, dw, dh } = geom;

    const geomRef = useRef(geom);
    geomRef.current = geom;

    useEffect(() => {
      setStrokes([]);
      setShapes([]);
      setTexts([]);
      setDraftStroke(null);
      setDraftShape(null);
      setDraftCrop(null);
      setHistory([{ strokes: [], shapes: [], texts: [] }]);
    }, [imageUri]);

    const canUndo = history.length > 1;

    const undo = useCallback(() => {
      setHistory((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.slice(0, -1);
        const snap = next[next.length - 1];
        setStrokes(snap.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })));
        setShapes(snap.shapes.map((h) => ({ ...h })));
        setTexts(snap.texts.map((t) => ({ ...t })));
        return next;
      });
      setDraftStroke(null);
      setDraftShape(null);
      setDraftCrop(null);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        canUndo,
        undo,
        exportComposite: async () => {
          if (!canvasRef.current || dh <= 0 || dw <= 0) return null;
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
          try {
            const shot = canvasRef.current.makeImageSnapshot({
              x: ox,
              y: oy,
              width: dw,
              height: dh,
            });
            if (!shot) return null;
            const b64 = shot.encodeToBase64(ImageFormat.PNG, 100);
            const { File, Paths } = await import('expo-file-system');
            const out = new File(Paths.cache, `edit-skia-${Date.now()}.png`);
            out.create({ overwrite: true });
            out.write(b64, { encoding: 'base64' });
            return out.uri;
          } catch {
            return null;
          }
        },
      }),
      [canvasRef, ox, oy, dw, dh, canUndo, undo],
    );

    const strokesRef = useRef(strokes);
    const shapesRef = useRef(shapes);
    const textsRef = useRef(texts);
    strokesRef.current = strokes;
    shapesRef.current = shapes;
    textsRef.current = texts;

    const snapshotForHistory = () => ({
      strokes: strokesRef.current.map((s) => ({
        ...s,
        points: s.points.map((p) => ({ ...p })),
      })),
      shapes: shapesRef.current.map((h) => ({ ...h })),
      texts: textsRef.current.map((t) => ({ ...t })),
    });

    const liveDrawRef = useRef<{ nx: number; ny: number }[] | null>(null);
    const liveShapeRef = useRef<{
      nx0: number;
      ny0: number;
      nx1: number;
      ny1: number;
    } | null>(null);
    const liveCropRef = useRef<{
      nx0: number;
      ny0: number;
      nx1: number;
      ny1: number;
    } | null>(null);

    const toNorm = (lx: number, ly: number) => {
      const { ox: gox, oy: goy, dw: gdw, dh: gdh } = geomRef.current;
      if (gdw <= 0 || gdh <= 0) return { nx: 0, ny: 0 };
      return {
        nx: clamp01((lx - gox) / gdw),
        ny: clamp01((ly - goy) / gdh),
      };
    };

    const insideImage = (lx: number, ly: number) => {
      const { ox: gox, oy: goy, dw: gdw, dh: gdh } = geomRef.current;
      return (
        lx >= gox && lx <= gox + gdw && ly >= goy && ly <= goy + gdh && gdw > 0 && gdh > 0
      );
    };

    const appendHistory = (snap: HistorySnap) => {
      setHistory((prev) => {
        const next = [...prev, snap];
        if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
        return next;
      });
    };

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: lx, locationY: ly } = e.nativeEvent;
          const m = modeRef.current;
          if (!insideImage(lx, ly)) return;
          const { nx, ny } = toNorm(lx, ly);
          if (m === 'draw') {
            liveDrawRef.current = [{ nx, ny }];
            liveShapeRef.current = null;
            setDraftStroke([{ nx, ny }]);
          } else if (m === 'shape') {
            liveShapeRef.current = { nx0: nx, ny0: ny, nx1: nx, ny1: ny };
            liveDrawRef.current = null;
            setDraftShape({ nx0: nx, ny0: ny, nx1: nx, ny1: ny });
          } else if (m === 'crop') {
            liveCropRef.current = { nx0: nx, ny0: ny, nx1: nx, ny1: ny };
            setDraftCrop({ nx0: nx, ny0: ny, nx1: nx, ny1: ny });
          } else if (m === 'text') {
            setTextModal({ nx, ny, input: '' });
          }
        },
        onPanResponderMove: (e) => {
          const { locationX: lx, locationY: ly } = e.nativeEvent;
          const m = modeRef.current;
          if (m === 'draw' && liveDrawRef.current) {
            const { nx, ny } = toNorm(lx, ly);
            liveDrawRef.current = [...liveDrawRef.current, { nx, ny }];
            setDraftStroke([...liveDrawRef.current]);
          } else if (m === 'shape' && liveShapeRef.current) {
            const { nx, ny } = toNorm(lx, ly);
            liveShapeRef.current = { ...liveShapeRef.current, nx1: nx, ny1: ny };
            setDraftShape({ ...liveShapeRef.current });
          } else if (m === 'crop' && liveCropRef.current) {
            const { nx, ny } = toNorm(lx, ly);
            liveCropRef.current = { ...liveCropRef.current, nx1: nx, ny1: ny };
            setDraftCrop({ ...liveCropRef.current });
          }
        },
        onPanResponderRelease: () => {
          const m = modeRef.current;
          const { dw: gdw, dh: gdh } = geomRef.current;
          if (m === 'draw' && liveDrawRef.current && liveDrawRef.current.length > 1) {
            const pts = liveDrawRef.current;
            appendHistory(snapshotForHistory());
            setStrokes((s) => [
              ...s,
              {
                points: pts,
                color: brushColorRef.current,
                width: brushWidthRef.current,
              },
            ]);
          }
          if (m === 'shape' && liveShapeRef.current) {
            const d = liveShapeRef.current;
            if (Math.hypot((d.nx1 - d.nx0) * gdw, (d.ny1 - d.ny0) * gdh) > 6) {
              appendHistory(snapshotForHistory());
              setShapes((s) => [
                ...s,
                {
                  kind: shapeKindRef.current,
                  nx0: d.nx0,
                  ny0: d.ny0,
                  nx1: d.nx1,
                  ny1: d.ny1,
                  color: brushColorRef.current,
                  strokeWidth: Math.max(2, brushWidthRef.current),
                },
              ]);
            }
          }
          liveDrawRef.current = null;
          liveShapeRef.current = null;
          setDraftStroke(null);
          setDraftShape(null);
          if (m !== 'crop') {
            /* keep crop draft */
          }
        },
      }),
    ).current;

    const onLayoutCanvas = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setLayoutW(width);
      setLayoutH(height);
    };

    const textFonts = useMemo(() => {
      const sizes = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36];
      const m = new Map<number, ReturnType<typeof matchFont>>();
      for (const sz of sizes) {
        m.set(
          sz,
          matchFont({
            fontFamily: 'sans-serif',
            fontSize: sz,
            fontWeight: '600',
          }),
        );
      }
      return m;
    }, []);

    const pickNearestFont = useCallback(
      (target: number) => {
        const sizes = [12, 14, 16, 18, 20, 22, 24, 28, 32, 36];
        let best = 18;
        let bestDiff = 999;
        for (const sz of sizes) {
          const d = Math.abs(sz - target);
          if (d < bestDiff) {
            bestDiff = d;
            best = sz;
          }
        }
        return (
          textFonts.get(best) ??
          matchFont({ fontFamily: 'sans-serif', fontSize: 18, fontWeight: '600' })
        );
      },
      [textFonts],
    );

    const strokePaths = useMemo(() => {
      return strokes.map((s) => ({
        path: buildSkPath(s, ox, oy, dw, dh),
        color: s.color,
        width: s.width,
      }));
    }, [strokes, ox, oy, dw, dh]);

    const draftPath = useMemo(() => {
      if (!draftStroke || draftStroke.length < 2) return null;
      return buildSkPath(
        { points: draftStroke, color: brushColor, width: brushWidth },
        ox,
        oy,
        dw,
        dh,
      );
    }, [draftStroke, brushColor, brushWidth, ox, oy, dw, dh]);

    const addTextFromModal = () => {
      if (!textModal) return;
      const t = textModal.input.trim();
      if (!t) {
        setTextModal(null);
        return;
      }
      appendHistory(snapshotForHistory());
      setTexts((prev) => [
        ...prev,
        {
          id: `${Date.now()}`,
          nx: textModal.nx,
          ny: textModal.ny,
          text: t,
          color: brushColor,
          fontRel: 0.042,
        },
      ]);
      setTextModal(null);
    };

    const cropPreview = useMemo(() => {
      if (!draftCrop || dw <= 0) return null;
      const nx0 = Math.min(draftCrop.nx0, draftCrop.nx1);
      const ny0 = Math.min(draftCrop.ny0, draftCrop.ny1);
      const nx1 = Math.max(draftCrop.nx0, draftCrop.nx1);
      const ny1 = Math.max(draftCrop.ny0, draftCrop.ny1);
      return {
        x0: ox + nx0 * dw,
        y0: oy + ny0 * dh,
        x1: ox + nx1 * dw,
        y1: oy + ny1 * dh,
      };
    }, [draftCrop, ox, oy, dw, dh]);

    const applyCrop = useCallback(async () => {
      if (!draftCrop || imgW <= 0 || imgH <= 0) {
        Alert.alert('Cắt ảnh', 'Kéo chọn vùng cần cắt.');
        return;
      }
      const nx0 = clamp01(Math.min(draftCrop.nx0, draftCrop.nx1));
      const ny0 = clamp01(Math.min(draftCrop.ny0, draftCrop.ny1));
      const nx1 = clamp01(Math.max(draftCrop.nx0, draftCrop.nx1));
      const ny1 = clamp01(Math.max(draftCrop.ny0, draftCrop.ny1));
      const cw = nx1 - nx0;
      const ch = ny1 - ny0;
      if (cw * imgW < 8 || ch * imgH < 8) {
        Alert.alert('Cắt ảnh', 'Vùng cắt quá nhỏ.');
        return;
      }
      try {
        const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
        const originX = Math.round(nx0 * imgW);
        const originY = Math.round(ny0 * imgH);
        const width = Math.round(cw * imgW);
        const height = Math.round(ch * imgH);
        const result = await manipulateAsync(
          imageUri,
          [{ crop: { originX, originY, width, height } }],
          { compress: 0.92, format: SaveFormat.JPEG },
        );
        onWorkingUriChange(result.uri);
        setDraftCrop(null);
        liveCropRef.current = null;
      } catch {
        Alert.alert('Lỗi', 'Không thể cắt ảnh.');
      }
    }, [draftCrop, imgW, imgH, imageUri, onWorkingUriChange]);

    const shapeElements = useMemo(() => {
      const out: ReactNode[] = [];
      const addOne = (sh: ShapeAnno) => {
        if (sh.kind === 'line' || sh.kind === 'arrow') {
          const x0 = ox + sh.nx0 * dw;
          const y0 = oy + sh.ny0 * dh;
          const x1 = ox + sh.nx1 * dw;
          const y1 = oy + sh.ny1 * dh;
          const sw = sh.strokeWidth;
          const col = sh.color;
          out.push(
            <Line
              key={`dl-${out.length}`}
              p1={{ x: x0, y: y0 }}
              p2={{ x: x1, y: y1 }}
              style="stroke"
              strokeWidth={sw}
              color={col}
              strokeCap="round"
            />,
          );
          if (sh.kind === 'arrow') {
            const head = arrowHeadPath(x0, y0, x1, y1, Math.max(12, sw * 2.2), Math.PI / 7);
            out.push(
              <SkiaPath
                key={`da-${out.length}`}
                path={head}
                style="stroke"
                strokeWidth={sw}
                color={col}
                strokeCap="round"
              />,
            );
          }
          return;
        }
        const nx0 = Math.min(sh.nx0, sh.nx1);
        const ny0 = Math.min(sh.ny0, sh.ny1);
        const nx1 = Math.max(sh.nx0, sh.nx1);
        const ny1 = Math.max(sh.ny0, sh.ny1);
        const x0 = ox + nx0 * dw;
        const y0 = oy + ny0 * dh;
        const x1 = ox + nx1 * dw;
        const y1 = oy + ny1 * dh;
        const w = x1 - x0;
        const h = y1 - y0;
        const sw = sh.strokeWidth;
        const col = sh.color;
        if (sh.kind === 'rect') {
          out.push(
            <Rect
              key={`dr-${out.length}`}
              x={x0}
              y={y0}
              width={w}
              height={h}
              style="stroke"
              strokeWidth={sw}
              color={col}
            />,
          );
        } else if (sh.kind === 'ellipse') {
          out.push(
            <Oval
              key={`do-${out.length}`}
              x={x0}
              y={y0}
              width={w}
              height={h}
              style="stroke"
              strokeWidth={sw}
              color={col}
            />,
          );
        }
      };

      const addDraft = () => {
        if (!draftShape) return;
        const draft: ShapeAnno = {
          kind: shapeKind,
          nx0: draftShape.nx0,
          ny0: draftShape.ny0,
          nx1: draftShape.nx1,
          ny1: draftShape.ny1,
          color: brushColor,
          strokeWidth: Math.max(2, brushWidth),
        };
        addOne(draft);
      };

      for (const sh of shapes) addOne(sh);
      addDraft();
      return out;
    }, [shapes, draftShape, ox, oy, dw, dh, shapeKind, brushColor, brushWidth]);

    const textElements = useMemo(() => {
      return texts.map((t) => {
        const targetPx = Math.round(
          t.fontRel * Math.min(dw > 0 ? dw : 1, dh > 0 ? dh : 1, 520),
        );
        const font = pickNearestFont(targetPx);
        const tx = ox + t.nx * dw;
        const ty = oy + t.ny * dh + targetPx * 0.85;
        return (
          <SkiaText key={t.id} x={tx} y={ty} text={t.text} font={font} color={t.color} />
        );
      });
    }, [texts, ox, oy, dw, dh, pickNearestFont]);

    if (!image && imageUri) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color="#00D9FF" />
        </View>
      );
    }

    return (
      <View style={styles.wrap}>
        <View style={styles.canvasHost} onLayout={onLayoutCanvas} {...panResponder.panHandlers}>
          <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
            {image && dw > 0 ? (
              <SkiaImage image={image} x={ox} y={oy} width={dw} height={dh} fit="fill" />
            ) : null}

            {strokePaths.map((sp, i) => (
              <SkiaPath
                key={`s-${i}`}
                path={sp.path}
                style="stroke"
                strokeWidth={sp.width}
                color={sp.color}
                strokeCap="round"
                strokeJoin="round"
              />
            ))}
            {draftPath ? (
              <SkiaPath
                path={draftPath}
                style="stroke"
                strokeWidth={brushWidth}
                color={brushColor}
                strokeCap="round"
                strokeJoin="round"
              />
            ) : null}

            {shapeElements}

            {textElements}

            {cropPreview ? (
              <>
                <Rect
                  x={ox}
                  y={oy}
                  width={dw}
                  height={cropPreview.y0 - oy}
                  color="rgba(0,0,0,0.45)"
                  style="fill"
                />
                <Rect
                  x={ox}
                  y={cropPreview.y1}
                  width={dw}
                  height={oy + dh - cropPreview.y1}
                  color="rgba(0,0,0,0.45)"
                  style="fill"
                />
                <Rect
                  x={ox}
                  y={cropPreview.y0}
                  width={cropPreview.x0 - ox}
                  height={cropPreview.y1 - cropPreview.y0}
                  color="rgba(0,0,0,0.45)"
                  style="fill"
                />
                <Rect
                  x={cropPreview.x1}
                  y={cropPreview.y0}
                  width={ox + dw - cropPreview.x1}
                  height={cropPreview.y1 - cropPreview.y0}
                  color="rgba(0,0,0,0.45)"
                  style="fill"
                />
                <Rect
                  x={cropPreview.x0}
                  y={cropPreview.y0}
                  width={cropPreview.x1 - cropPreview.x0}
                  height={cropPreview.y1 - cropPreview.y0}
                  style="stroke"
                  strokeWidth={2}
                  color="#00D9FF"
                />
              </>
            ) : null}
          </Canvas>
        </View>

        {mode === 'crop' && draftCrop ? (
          <View style={styles.cropBar}>
            <TouchableOpacity style={styles.cropBtn} onPress={() => void applyCrop()}>
              <Text style={styles.cropBtnText}>Cắt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cropBtnSecondary}
              onPress={() => {
                setDraftCrop(null);
                liveCropRef.current = null;
              }}
            >
              <Text style={styles.cropBtnSecondaryText}>Huỷ</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.toolbar, { paddingBottom: Math.max(4, insets.bottom) }]}>
          <View style={styles.toolbarRow}>
            {(
              [
                ['draw', 'Vẽ'] as const,
                ['shape', 'Hình'] as const,
                ['text', 'Chữ'] as const,
                ['crop', 'Cắt'] as const,
              ] as const
            ).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.modeChip, mode === key && styles.modeChipOn]}
                onPress={() => setMode(key as EditorMode)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeChipText, mode === key && styles.modeChipTextOn]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
            {mode === 'shape' ? (
                <>
                  <View style={styles.toolbarSep} />
                  {(
                    [
                      ['rect', '□'] as const,
                      ['ellipse', '○'] as const,
                      ['line', '／'] as const,
                      ['arrow', '➜'] as const,
                    ] as const
                  ).map(([k, sym]) => (
                    <TouchableOpacity
                      key={k}
                      style={[styles.shapeChip, shapeKind === k && styles.shapeChipOn]}
                      onPress={() => setShapeKind(k)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.shapeChipText, shapeKind === k && styles.shapeChipTextOn]}>
                        {sym}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
            ) : null}
          </View>

          <View style={styles.toolbarRow}>
            {COLOR_PRESETS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  brushColor === c && styles.colorDotOn,
                ]}
                onPress={() => setBrushColor(c)}
                activeOpacity={0.8}
              />
            ))}
            <View style={styles.strokeSep} />
            {[4, 8, 14].map((w) => (
              <TouchableOpacity
                key={w}
                style={[styles.widthChip, brushWidth === w && styles.widthChipOn]}
                onPress={() => setBrushWidth(w)}
                activeOpacity={0.7}
              >
                <View
                  style={[styles.widthDot, { width: Math.max(3, w * 0.55), height: Math.max(3, w * 0.55), borderRadius: 99 }]}
                />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.undoBtn, !canUndo && styles.undoBtnOff]}
              onPress={undo}
              disabled={!canUndo}
              activeOpacity={0.7}
            >
              <Text style={styles.undoText}>↩</Text>
            </TouchableOpacity>
          </View>
        </View>

        {textModal ? (
          <View style={styles.textOverlay}>
            <TextInput
              style={styles.textInput}
              value={textModal.input}
              onChangeText={(x) => setTextModal((m) => (m ? { ...m, input: x } : m))}
              placeholder="Nhập chữ..."
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            <View style={styles.textActions}>
              <TouchableOpacity onPress={() => setTextModal(null)}>
                <Text style={styles.textCancel}>Huỷ</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addTextFromModal}>
                <Text style={styles.textOk}>Thêm</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  canvasHost: { flex: 1, minHeight: 0, backgroundColor: '#000' },
  cropBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexShrink: 0,
    backgroundColor: '#121B2A',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  cropBtn: {
    backgroundColor: '#00D9FF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 14,
  },
  cropBtnText: { color: '#0B131F', fontWeight: '700', fontSize: 13 },
  cropBtnSecondary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  cropBtnSecondaryText: { color: '#FFF', fontSize: 13 },
  toolbar: {
    flexShrink: 0,
    backgroundColor: '#121B2A',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toolbarSep: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginHorizontal: 2,
  },
  strokeSep: { width: 10 },
  modeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modeChipOn: { backgroundColor: 'rgba(0,217,255,0.28)' },
  modeChipText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '600' },
  modeChipTextOn: { color: '#FFF' },
  shapeChip: {
    minWidth: 28,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  shapeChipOn: { backgroundColor: 'rgba(0,217,255,0.22)' },
  shapeChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  shapeChipTextOn: { color: '#FFF' },
  colorDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorDotOn: { borderColor: '#00D9FF' },
  widthChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  widthChipOn: { backgroundColor: 'rgba(0,217,255,0.22)' },
  widthDot: { backgroundColor: '#FFF' },
  undoBtn: {
    marginLeft: 'auto',
    minWidth: 36,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  undoBtnOff: { opacity: 0.35 },
  undoText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  textOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  textInput: {
    backgroundColor: '#1e2e45',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 16,
  },
  textActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
    marginTop: 12,
  },
  textCancel: { color: '#9CA3AF', fontSize: 16 },
  textOk: { color: '#00D9FF', fontSize: 16, fontWeight: '700' },
});
